const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dotenv.config();

const PORT = process.env.PORT;
const uri = process.env.MONGO_URI;

const app = express();

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("study-nook");
    const roomsCollection = db.collection("rooms");

    app.get("/rooms", async (req, res) => {
      const result = await roomsCollection.find().toArray();
      res.json(result);
    });

    app.get("/rooms/latest", async (req, res) => {
      const result = await roomsCollection
        .find()
        .sort({ _id: -1 })
        .limit(6)
        .toArray();

      res.json(result);
    });

    app.get("/rooms/:id", async (req, res) => {
      const { id } = req.params;
      const result = await roomsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.json(result);
    });

    app.post("/rooms", async (req, res) => {
      const roomData = req.body;
      const result = await roomsCollection.insertOne(roomData);
      res.json(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("App is running");
});

app.listen(PORT, () => {
  console.log(`App is running in port ${PORT}`);
});
