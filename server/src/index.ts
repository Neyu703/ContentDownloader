import app from "./app.js";
import { updateYtDlp, checkEnvironment } from "./youtube.js";

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
  updateYtDlp().then(checkEnvironment);
});
