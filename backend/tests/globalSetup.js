// Starts one in-memory MongoDB for the whole run (test files execute sequentially and clear
// their collections after each test), instead of booting a mongod per file.
export default async function globalSetup({ provide }) {
  if (process.env.MONGODB_TEST_URI) {
    provide("mongoUri", process.env.MONGODB_TEST_URI);
    return () => {};
  }
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const mongod = await MongoMemoryServer.create({ instance: { dbName: "ghosted_test" } });
  provide("mongoUri", mongod.getUri("ghosted_test"));
  return async () => {
    await mongod.stop();
  };
}
