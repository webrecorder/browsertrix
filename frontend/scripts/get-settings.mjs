import fetch from "node-fetch";
import updateDotenv from "update-dotenv";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  try {
    const resp = await fetch(`${process.env.API_BASE_URL}/settings`);
    const body = await resp.json();

    const newEnv = await updateDotenv({
      REGISTRATION_ENABLED: Boolean(body.enabled).toString(),
    });

    console.log(
      ".env file updated:",
      `REGISTRATION_ENABLED=${newEnv["REGISTRATION_ENABLED"]}`
    );
  } catch {
    console.log(
      "could not update .env file, env is now:",
      `REGISTRATION_ENABLED=${process.env.REGISTRATION_ENABLED}`
    );
  }
}

main();
