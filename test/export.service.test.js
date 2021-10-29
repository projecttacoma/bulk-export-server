const { client } = require("../src/util/mongo");
const build = require("../src/server/app");
const app = build();
const supertest = require("supertest");
describe("Check barebones bulk export logic", () => {
  beforeEach(async () => {
    await client.connect();
    await app.ready();
  });
  test("check 202 returned and content-location populated", async () => {
    await supertest(app.server)
      .get("/$export")
      .expect(202)
      .then((response) => {
        expect(response.headers["content-location"]).toBeDefined();
      });
  });

  test("check 202 returned and content-location populated with params", async () => {
    await supertest(app.server)
      .get("/$export?_outputFormat=ndjson")
      .expect(202)
      .then((response) => {
        expect(response.headers["content-location"]).toBeDefined();
      });
  });

  test("check 400 returned for invalid outputFormat", async () => {
    await supertest(app.server)
      .get("/$export?_outputFormat=invalid")
      .expect(400)
      .then((response) => {
        expect(JSON.parse(response.text).message).toEqual(
          "The following output format is not supported for _outputFormat param for $export: invalid"
        );
      });
  });

  test("check 400 returned for invalid type", async () => {
    await supertest(app.server)
      .get("/$export?_type=invalid")
      .expect(400)
      .then((response) => {
        expect(JSON.parse(response.text).message).toEqual(
          "The following resourceType is not supported for _type param for $export: invalid"
        );
      });
  });

  test("check 400 returned for unsupported _since param", async () => {
    await supertest(app.server)
      .get("/$export?_since=date")
      .expect(400)
      .then((response) => {
        expect(JSON.parse(response.text).message).toEqual(
          "The _since parameter is not yet supported for $export"
        );
      });
  });

  test("check 400 returned for unrecognized param", async () => {
    await supertest(app.server)
      .get("/$export?_unrecognizedparam=invalid")
      .expect(400)
      .then((response) => {
        expect(JSON.parse(response.text).message).toEqual(
          "The following parameters are unrecognized by the server: _unrecognizedparam."
        );
      });
  });

  afterEach(async () => {
    await client.close();
  });
});
