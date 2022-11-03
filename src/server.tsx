import * as http from "http";
import { tryExtractErrorMessage } from "trader.ts/utils";
import { findStaticFilesToInclude, tryRouteStaticFiles } from "./static";
import * as Router from "trader.ts/router";
import { Right } from "purify-ts";
import { makeRoute } from "trader.ts/route";
import h from "trader-hyperscript";
import type { clientcomponents } from "./client";
import { renderInBrowser } from "trader.ts/clientcomponents/clientcomponents";

export const landingpageStaticFiles = {
  clientjs: "/client/client.js",
};
const renderClientComponent = renderInBrowser<clientcomponents>();

go();

async function go() {
  const staticFiles = await findStaticFilesToInclude({
    files: landingpageStaticFiles,
  });

  const router = new Router.Router(
    {
      renderClientComponent,
      getStaticFileHeaders: function () {
        return [
          h("style", {}),
          h("meta", {
            name: "viewport",
            content: "width=device-width, initial-scale=1.0, user-scalable=no",
          }),
          h("script", {
            src: staticFiles.clientjs.keyWithHash,
            // Host it as module if you're using dynamic imports, or as normal JS if not
            type: "application/javascript",
            /* type: "module", */
          }),
        ];
      },
    },
    async function (req) {
      return Right({});
    }
  );

  router.page(
    makeRoute("/"),
    { needsAuthorization: false },
    async function (ctx) {
      return (
        <html>
          <head>{ctx.getStaticFileHeaders()}</head>
          <body>{ctx.renderClientComponent("test_comp", {})}</body>
        </html>
      );
    }
  );

  const port = 8080;

  http
    .createServer(function (req, res) {
      const url = req.url || "";
      console.log(`Serving ${url}`);
      try {
        const staticRouted = tryRouteStaticFiles(staticFiles, url, res);
        if (!staticRouted) {
          const routed = router.run(
            { redirectOnUnauthorizedPage: "/" },
            req,
            res
          );
          if (routed === false) {
            res.writeHead(404);
            res.end();
          }
        }
      } catch (err) {
        res.writeHead(400, tryExtractErrorMessage(err));
        res.end();
      }
    })
    .listen(port);
}
