import h from "trader-hyperscript";
import { Source } from "trader.ts/types/source";
import { dyn } from "trader.ts/ui";

export class Form<ParsedScope extends { [fieldName: string]: any } = {}> {
  private readonly fieldCalculators: {
    [fieldName in keyof ParsedScope]: {
      dependsOn: (keyof ParsedScope)[];
      calc: (deps: any /* temp */) => Promise<Field<any>>;
    };
  };

  constructor(
    fs: {
      [fieldName in keyof ParsedScope]: {
        dependsOn: (keyof ParsedScope)[];
        calc: (deps: any /* temp */) => Promise<Field<any>>;
      };
    }
  ) {
    this.fieldCalculators = fs;
  }

  public addField<
    MyFieldName extends string,
    MyField extends Field<any>,
    DependsOn extends keyof ParsedScope
  >(
    fieldName: MyFieldName,
    dependsOn: DependsOn[],
    fd: (deps: { [dep in DependsOn]: ParsedScope[dep] }) => Promise<MyField>
  ): Form<ParsedScope & { [fn in MyFieldName]: getParsedFromField<MyField> }> {
    return new Form<
      ParsedScope & { [fn in MyFieldName]: getParsedFromField<MyField> }
    >({
      ...this.fieldCalculators,
      [fieldName]: {
        dependsOn: dependsOn,
        calc: fd,
      },
    });
  }

  public build(): Field<ParsedScope> {
    const cleanups: (() => void)[] = [];
    const self = this;

    const mainSource: Source<Parsing<ParsedScope>> = new Source({
      tag: "initial",
    });
    const fieldNames = object_keys(this.fieldCalculators);
    const currentStatusOfFieldsS = {} as {
      [fieldName in keyof ParsedScope]: {
        source: Source<Parsing<ParsedScope[fieldName]>>;
        field: Source<null | Field<ParsedScope[fieldName]>>;
        cleanups: (() => void)[];
      };
    };

    console.log("Making current status sources");

    for (let fieldName of fieldNames) {
      // Setting up a collection of sources where we always have the current "Parsing" value of each field
      const currentStatusS: typeof currentStatusOfFieldsS[typeof fieldName] = {
        source: new Source({
          tag: "loading",
        }),
        field: new Source(null),
        cleanups: [],
      };
      currentStatusOfFieldsS[fieldName] = currentStatusS;

      // Whenever these change -> update the main source
      cleanups.push(
        currentStatusS.source.observe(recalcMainSource) // TODO optim this so we don't always need to iterate through every field? Fairly complicated
      );

      // For every field that is observing this field -> trigger recalculation when this one changes
      for (let fieldName2 of fieldNames) {
        const fieldCalc2 = this.fieldCalculators[fieldName2];
        if (fieldCalc2.dependsOn.includes(fieldName)) {
          cleanups.push(
            currentStatusS.source.observe(() => runFieldCalc(fieldName2))
          );
        }
      }
    }

    // Attempt to run the fieldCalc with its deps, from the currentStatusOfFieldsS collection
    function runFieldCalc(fieldName: keyof ParsedScope) {
      const fieldCalc = self.fieldCalculators[fieldName];
      const res = runFieldCalcImplementation(fieldCalc);
      if (res === null) {
      } else {
        console.log(`Loading field ${fieldName}`);
        const curr = currentStatusOfFieldsS[fieldName];
        curr.cleanups.forEach((f) => f());
        curr.cleanups.length = 0;
        curr.field.set(null);
        curr.source.set({ tag: "loading" });
        res.then(function (field) {
          console.log(`Loaded field ${fieldName}`);
          curr.field.set(field);

          // "Forward"ing source
          curr.source.set(field.s.get());
          curr.cleanups.push(
            field.s.observe((parsingVal) => curr.source.set(parsingVal))
          );

          // Adding cleanup of field to our cleanups
          curr.cleanups.push(field.cleanup);
        });
      }
    }

    function runFieldCalcImplementation<T>(fieldCalc: {
      dependsOn: (keyof ParsedScope)[];
      calc: (deps: any /* temp */) => Promise<Field<T>>;
    }): null | Promise<Field<T>> {
      const deps = {} as any; // temp
      for (let dependsOn_ of fieldCalc.dependsOn) {
        const depVal = currentStatusOfFieldsS[dependsOn_].source.get();
        if (depVal.tag === "loading") {
          return null;
        } else if (depVal.tag === "err") {
          return null;
        } else if (depVal.tag === "initial") {
          return null;
        } else {
          deps[dependsOn_] = depVal.parsed;
        }
      }
      return fieldCalc.calc(deps);
    }

    function recalcMainSource() {
      mainSource.set(recalcMainSourceImplementation());
    }

    function recalcMainSourceImplementation(): Parsing<ParsedScope> {
      const buildingUp = {} as ParsedScope;
      for (let fieldName of fieldNames) {
        const currentVal = currentStatusOfFieldsS[fieldName].source.get();
        if (currentVal.tag === "loading") {
          return { tag: "loading" };
        } else if (currentVal.tag === "err") {
          return { tag: "err" };
        } else if (currentVal.tag === "initial") {
          return { tag: "initial" };
        } else if (currentVal.tag === "parsed") {
          buildingUp[fieldName] = currentVal.parsed;
        }
      }

      return { tag: "parsed", parsed: buildingUp };
    }

    console.log("Kicking off calculations");

    for (let fieldName of fieldNames) {
      // Kick off calculations
      runFieldCalc(fieldName);
    }

    function cleanup() {
      cleanups.forEach((f) => f());
      for (let fieldName of fieldNames) {
        currentStatusOfFieldsS[fieldName].cleanups.forEach((f) => f());
      }
    }

    return {
      s: mainSource,
      cleanup,
      render: function () {
        // TODO: setup/cleanup sequence is not OK
        const renderedFields = [];
        for (let fieldName of fieldNames) {
          const fieldS = currentStatusOfFieldsS[fieldName].field;
          renderedFields.push(
            dyn(fieldS, function (field) {
              if (field === null) {
                return <span></span>;
              } else {
                return <div>{field.render()}</div>;
              }
            })
          );
        }

        return <div>{renderedFields}</div>;
      },
    };
  }
}

export function numberBox(initialVal?: number): Promise<Field<number>> {
  const rawS = new Source(initialVal?.toString() || "");

  const parsedS: Source<Parsing<number>> = new Source(
    initialVal !== undefined
      ? { tag: "parsed", parsed: initialVal }
      : { tag: "initial" }
  );

  function parse(
    raw: string
  ): { tag: "parsed"; parsed: number } | { tag: "err" } {
    try {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        return { tag: "parsed", parsed };
      } else {
        return { tag: "err" };
      }
    } catch {
      return { tag: "err" };
    }
  }

  const cleanup = rawS.observe((raw) => {
    parsedS.set(parse(raw));
  });

  function render() {
    const i = (<input type="number" value={rawS.get()} />) as HTMLInputElement;
    i.oninput = () => rawS.set(i.value);
    return i;
  }

  return Promise.resolve({
    s: parsedS,
    cleanup,
    render,
  });
}

export function selectBox<T>(
  opts: T[],
  initial: T | null | undefined,
  show: (t: T) => string
): Promise<Field<T>> {
  const rawS = new Source(initial ? show(initial) : "");

  const parsedS: Source<Parsing<T>> = new Source(
    initial !== null && initial !== undefined
      ? { tag: "parsed", parsed: initial }
      : { tag: "initial" }
  );

  function parse(raw: string): { tag: "parsed"; parsed: T } | { tag: "err" } {
    try {
      const parsed = opts.find((opt) => show(opt) === raw);
      if (parsed) {
        return { tag: "parsed", parsed };
      } else {
        return { tag: "err" };
      }
    } catch {
      return { tag: "err" };
    }
  }

  const cleanup = rawS.observe((raw) => {
    parsedS.set(parse(raw));
  });

  function render() {
    const i = (
      <select value={rawS.get()}>
        {initial === null || initial === undefined ? (
          <option value=""></option>
        ) : (
          ((null as unknown) as HTMLOptionElement)
        )}
        {opts.map((opt) => (
          <option value={show(opt)}>{show(opt)}</option>
        ))}
      </select>
    ) as HTMLInputElement;
    i.oninput = () => rawS.set(i.value);
    return i;
  }

  return Promise.resolve({
    s: parsedS,
    cleanup,
    render,
  });
}

type Parsing<T> =
  | { tag: "loading" }
  | { tag: "initial" }
  | { tag: "err"; label?: string }
  | { tag: "parsed"; parsed: T };

type getParsedFromField<F> = F extends Field<infer Parsed> ? Parsed : never;

export interface Field<Parsed> {
  s: Source<Parsing<Parsed>>;
  render: () => HTMLElement;
  cleanup: () => void;
}

export function object_keys<T extends object>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}
