const updateDotenv = require("update-dotenv");
// const request = require("request");

// TODO actual prod URL
const API_BASE_URL = "btrix-dev.webrecorder.net/api";

function fakeRequest(url, cb) {
  cb(null, null, { enabled: false });
}

fakeRequest(`${API_BASE_URL}/settings`, (error, response, body) => {
  if (error) {
    console.error(error);
    return;
  }

  updateDotenv({
    REGISTRATION_ENABLED: Boolean(body.enabled).toString(),
  }).then((newEnv) =>
    console.log(
      ".env file updated:",
      `REGISTRATION_ENABLED=${newEnv["REGISTRATION_ENABLED"]}`
    )
  );
});
