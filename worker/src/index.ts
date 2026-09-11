import express from "express";
import cors from "cors";
import { config } from "./config";
import { enrutador } from "./http/rutas";

const app = express();
const port = config.PORT;

app.use(cors());
app.use(express.json());

// Montar rutas de API
app.use(enrutador);

app.listen(port, () => {
  console.log(`Worker de ELEVAPLUS iniciado en puerto ${port} (ambiente: ${config.NODE_ENV})`);
});

