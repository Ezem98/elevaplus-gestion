import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Endpoint de health check
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "elevaplus-worker",
    ambiente: process.env.NODE_ENV || "staging",
    timestamp: new Date().toISOString(),
  });
});

app.listen(port, () => {
  console.log(`Worker de ELEVAPLUS iniciado en puerto ${port}`);
});
