/**
 * db.js — MongoDB connection.
 *
 * Production: MONGO_URI required.
 * Development: in-memory MongoDB used when MONGO_URI is empty.
 */
const mongoose = require("mongoose");
const logger   = require("./logger");

async function connectDatabase({ mongoUri, nodeEnv }) {
  let uri = mongoUri;

  if (!uri) {
    if (nodeEnv === "production") {
      logger.error("FATAL: MONGO_URI is required in production.");
      process.exit(1);
    }
    const { MongoMemoryServer } = require("mongodb-memory-server");
    const mem = await MongoMemoryServer.create();
    uri = mem.getUri("CampusFlow");
    logger.info("No MONGO_URI set — using in-memory MongoDB for development.");
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS:          45000,
    });
    logger.info("MongoDB connected");
  } catch (err) {
    logger.error("MongoDB connection failed", { error: err.message });
    process.exit(1);
  }
}

module.exports = connectDatabase;
