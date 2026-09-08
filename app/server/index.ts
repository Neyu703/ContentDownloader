import http from "node:http";
import app from "./app.js";
import { updateYtDlp, checkEnvironment } from "./environment.js";

const PORT = process.env.PORT ?? 3001;
http.createServer(app).listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
  updateYtDlp().then(checkEnvironment);
});
