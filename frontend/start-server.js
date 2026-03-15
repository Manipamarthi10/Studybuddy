const http = require("http");
const next = require("next");

const dev = false;
const hostname = process.env.HOSTNAME || "localhost";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http
    .createServer((req, res) => handle(req, res))
    .listen(port, hostname, () => {
      console.log(`StudyBuddy frontend ready on http://${hostname}:${port}`);
    });
}).catch((error) => {
  console.error("Failed to start frontend server", error);
  process.exit(1);
});
