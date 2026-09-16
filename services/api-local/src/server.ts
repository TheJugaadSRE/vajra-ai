import "dotenv/config";
import { createApp } from "./app";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const { app } = createApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`VAJRA API (local) listening on http://localhost:${PORT}`);
});
