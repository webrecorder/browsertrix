import fetch from "node-fetch";
import updateDotenv from "update-dotenv";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  try {
    const resp = await fetch(`${process.env.API_BASE_URL}/settings`);
    const body = await resp.json();

    const newEnv = await updateDotenv({
      REGISTRATION_ENABLED: (
        Boolean(body.registrationEnabled) || false
      ).toString(),
      JWT_TOKEN_LIFETIME_SECONDS: (body.jwtTokenLifetime || 3600).toString(),
    });

    console.log(
      ".env file updated:\n",
      `REGISTRATION_ENABLED=${newEnv["REGISTRATION_ENABLED"]}\nJWT_TOKEN_LIFETIME_SECONDS=${newEnv["JWT_TOKEN_LIFETIME_SECONDS"]}`
    );
  } catch (e) {
    // console.error(e);
    console.log(
      "could not update .env file, env is now:\n",
      `REGISTRATION_ENABLED=${process.env.REGISTRATION_ENABLED}\nJWT_TOKEN_LIFETIME_SECONDS=${process.env.JWT_TOKEN_LIFETIME_SECONDS}`
    );
  }
}

main();
