
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const pool = require("./config/db");
const authRoutes = require("./routes/auth");
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use("/api/auth", authRoutes);
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      status: "ok",
      message: "Railway Reservation API is running",
      database: "connected"
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Database connection failed"
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 5000);
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = app;
