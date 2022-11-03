import * as fs from "fs/promises";
import * as path from "path";
import { ServerRequest, ServerResponse } from "trader.ts/router";
import * as stream from "stream";
import * as zlib from "zlib";
import { debuglog } from "util";
import { tryExtractErrorMessage } from "trader.ts/utils";

const log = debuglog("static");

// eg: style.js -> becomes style.<hash>.js
// -> This function finds them again at runtime
export async function findStaticFilesToInclude<
  Files extends { [s: string]: string }
>(opts: {
  files: Files;
}): Promise<
  {
    [s in keyof Files]: {
      fullPath: string;
      nameWithHashAndExt: string;
      keyWithHash: string;
    };
  }
> {
  // This will break if we ever switch to es6 modules on the server (at runtime), as __dirname is no longer supported then. Google for alternative, it exists

  const out = {} as {
    [s in keyof Files]: {
      fullPath: string;
      keyWithHash: string;
      nameWithHashAndExt: string;
    };
  };
  const keys: (keyof Files)[] = Object.keys(opts.files);

  for (let key of keys) {
    const filePath = opts.files[key];
    const fullPath = path.join(__dirname, filePath);
    const parsed = path.parse(fullPath);
    const containingFolder = await fs.readdir(parsed.dir);
    const foundFile = containingFolder.find(
      (f) => f.startsWith(parsed.name) && f.endsWith(parsed.ext)
    );
    if (foundFile) {
      const fullPathWithHash = path.join(parsed.dir, foundFile);
      out[key] = {
        fullPath: fullPathWithHash,
        keyWithHash: fullPathWithHash.replace(__dirname, ""),
        nameWithHashAndExt: path.parse(foundFile).base,
      };
    } else {
      throw new Error(
        `Static file not found at ${filePath}, fullPath: ${fullPath}`
      );
    }
  }

  return out;
}

export function sendDataAsImmutable(
  req: ServerRequest,
  res: ServerResponse,
  data: string | Buffer,
  mimetype?: string
): void {
  try {
    res.setHeader("Cache-Control", "public,max-age=604800,immutable");
    res.setHeader("Expires", "Wed, 21 Oct 2099 07:28:00 GMT");
    if (mimetype) {
      res.setHeader("Content-Type", mimetype);
    } else {
    }
    // Brotli Compression (= Chrome)
    if (
      req.headers["accept-encoding"] &&
      req.headers["accept-encoding"].includes("br")
    ) {
      res.setHeader("Content-Encoding", "br");
      const readable = stream.Readable.from(data);
      stream.pipeline(
        readable,
        // TODO: could be interesting to precache all assets with very high compression rate in production?
        zlib.createBrotliCompress({
          params: {
            [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
            [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
          },
        }),
        res,
        (err) => {
          if (err) {
            console.error("Failed Brotli compression: " + err);
          }
        }
      );
    } else if (
      // Gzip Compression
      req.headers["accept-encoding"] &&
      req.headers["accept-encoding"].includes("gzip")
    ) {
      res.setHeader("Content-Encoding", "gzip");
      const readable = stream.Readable.from(data);
      stream.pipeline(readable, zlib.createGzip({ level: 6 }), res, (err) => {
        if (err) {
          console.error("Failed gzip: " + err);
        }
      });
    } else {
      // No compression
      res.writeHead(200);
      res.end(data);
    }
  } catch (err) {
    console.error(
      "Failed sending data: " +
        JSON.stringify(tryExtractErrorMessage(err), null, 2)
    );
    res.writeHead(404);
    res.end(JSON.stringify(err, null, 2));
  }
}

export async function sendStatic(
  path: string,
  res: ServerResponse,
  caching?: "do-infinite-caching"
) {
  try {
    const data = await fs.readFile(path);
    if (caching === "do-infinite-caching") {
      res.setHeader("Cache-Control", "public,max-age=604800,immutable");
      res.setHeader("Expires", "Wed, 21 Oct 2099 07:28:00 GMT");
      if (path.endsWith(".svg")) {
        res.setHeader("Content-Type", "image/svg+xml");
      }
      if (path.endsWith(".png")) {
        res.setHeader("Content-Type", "image/png");
      }
      if (path.endsWith(".js")) {
        res.setHeader("Content-Type", "application/javascript");
      }
    }
    res.writeHead(200);
    res.end(data);
  } catch (err) {
    console.error("Failed send static: " + JSON.stringify(err, null, 2));
    res.writeHead(404);
    res.end(JSON.stringify(err, null, 2));
  }
}

export function tryRouteStaticFiles<
  Files extends {
    [s: string]: {
      fullPath: string;
      nameWithHashAndExt: string;
      keyWithHash: string;
    };
  }
>(st: Files, url: string, res: ServerResponse): boolean {
  log(`Trying to route static file: ${url}`);
  const found = Object.values(st).find((f) => f.keyWithHash === url);
  if (found !== undefined) {
    sendStatic(found.fullPath, res, "do-infinite-caching");
    return true;
  }
  return false;
}
