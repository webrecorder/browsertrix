import fetch from "node-fetch";
import updateDotenv from "update-dotenv";

// TODO actual prod URL
const API_BASE_URL = "btrix-dev.webrecorder.net/api";

function fakeFetch() {
  const fakeResponse = {
    async json() {
      return { enabled: false };
    },
  };
  return Promise.resolve(fakeResponse);
}

async function main() {
  const resp = await fakeFetch(`${API_BASE_URL}/settings`);
  const body = await resp.json();

  const newEnv = await updateDotenv({
    REGISTRATION_ENABLED: Boolean(body.enabled).toString(),
  });

  console.log(
    ".env file updated:",
    `REGISTRATION_ENABLED=${newEnv["REGISTRATION_ENABLED"]}`
  );
}

main();
