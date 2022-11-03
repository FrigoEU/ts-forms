import { ClientComponents } from "trader.ts";
import h from "trader-hyperscript";
import { Field, Form, numberBox, selectBox } from "./forms";
import { dyn, scheduleForCleanup } from "trader.ts/ui";

export const client = ClientComponents.registerClientComponentsSync({
  test_comp: render,
});

export type clientcomponents = ClientComponents.ClientComponentsExport<
  typeof client
>;

function render() {
  const marker = <div>hallo from client</div>;
  const form = buildForm();
  const field = form.build();

  scheduleForCleanup(field.cleanup);

  return [
    marker,
    field.render(),
    <div>
      {dyn(field.s, function (formVal) {
        return <div>{JSON.stringify(formVal)}</div>;
      })}
    </div>,
  ];
}

function professionsRpc(): Promise<{ name: string; profession_id: number }[]> {
  return Promise.resolve([
    { name: "doctor", profession_id: 1 },
    { name: "bakker", profession_id: 2 },
  ]);
}
function coursesRpc(): Promise<{ name: string; course_id: number }[]> {
  return Promise.resolve([
    { name: "math", course_id: 1 },
    { name: "nederlands", course_id: 2 },
  ]);
}

function buildForm() {
  return new Form({})
    .addField("age", [], () => numberBox(5))
    .addField("age2", ["age"], () => numberBox())
    .addField(
      "occupation",
      ["age2"],
      (
        s
      ): Promise<
        Field<
          | { name: string; profession_id: number }
          | { name: string; course_id: number }
        >
      > => {
        if (s.age2 > 18) {
          return professionsRpc().then((profs) =>
            selectBox(profs, profs[0], (p) => p.name)
          );
        } else {
          return coursesRpc().then((courses) =>
            selectBox(courses, null, (c) => c.name)
          );
        }
      }
    ); // if age > 18 -> profession, else -> student
}
