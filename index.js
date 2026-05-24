const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
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

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden" });
  }
};

async function run() {
  try {
    // await client.connect();

    const db = client.db("study-nook");
    const roomsCollection = db.collection("rooms");
    const bookingsCollection = db.collection("bookings");

    app.get("/api/rooms", async (req, res) => {
      const { search, amenities, min, max } = req.query;

      let queries = {};

      if (search && search !== "undefined") {
        queries.roomName = { $regex: search, $options: "i" };
      }

      if (amenities && amenities !== "undefined") {
        queries.amenities = { $all: amenities.split(",") };
      }

      if ((min && min !== "undefined") || (max && max !== "undefined")) {
        queries.hourlyRate = {};

        if (min) {
          queries.hourlyRate.$gt = min;
        }

        if (max) {
          queries.hourlyRate.$lt = max;
        }
      }

      const result = await roomsCollection
        .find(queries)
        .sort({ _id: -1 })
        .toArray();
      res.json(result);
    });

    app.get("/api/rooms/latest", async (req, res) => {
      const result = await roomsCollection
        .find()
        .sort({ _id: -1 })
        .limit(6)
        .toArray();

      res.json(result);
    });

    app.get("/api/rooms/:id", async (req, res) => {
      const { id } = req.params;
      const result = await roomsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.json(result);
    });

    app.get("/api/my-listings/:userId", verifyToken, async (req, res) => {
      const { userId } = req.params;

      const result = await roomsCollection
        .find({
          ownerId: userId,
        })
        .sort({ _id: -1 })
        .toArray();

      res.json(result);
    });

    app.post("/api/booking", verifyToken, async (req, res) => {
      const bookingData = req.body;
      const { roomId, bookingDate, startTime, endTime } = bookingData;

      const alreadyBooked = await bookingsCollection.findOne({
        roomId: roomId,
        status: "confirmed",
        bookingDate: bookingDate,
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
      });

      if (alreadyBooked) {
        return res.json({ error: "Already booked in this time slots" });
      }

      await roomsCollection.updateOne(
        {
          _id: new ObjectId(roomId),
        },
        {
          $inc: {
            bookingCount: 1,
          },
        },
      );

      const result = await bookingsCollection.insertOne(bookingData);

      res.json(result);
    });

    app.get("/api/my-bookings/:userId", verifyToken, async (req, res) => {
      const { userId } = req.params;
      const result = await bookingsCollection
        .find({
          userId: userId,
        })
        .sort({ _id: -1 })
        .toArray();
      res.json(result);
    });

    app.patch("/api/bookings/:id/cancel", verifyToken, async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.id;

      const result = await bookingsCollection.updateOne(
        {
          _id: new ObjectId(id),
          userId: userId,
          status: "confirmed",
        },
        {
          $set: {
            status: "canceled",
          },
        },
      );

      if (result.modifiedCount === 0) {
        return res.json({ error: "Booking not found or already canceled" });
      }

      const booking = await bookingsCollection.findOne({
        _id: new ObjectId(id),
      });

      await roomsCollection.updateOne(
        {
          _id: new ObjectId(booking.roomId),
        },
        {
          $inc: {
            bookingCount: -1,
          },
        },
      );

      res.json(result);
    });

    app.patch("/api/rooms/:id/edit", verifyToken, async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.id;
      const updatedData = req.body;

      const result = await roomsCollection.updateOne(
        {
          _id: new ObjectId(id),
          ownerId: userId,
        },
        {
          $set: updatedData,
        },
      );

      res.json(result);
    });

    app.delete("/api/rooms/:id/delete", verifyToken, async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.id;

      const result = await roomsCollection.deleteOne({
        _id: new ObjectId(id),
        ownerId: userId,
      });

      await bookingsCollection.deleteMany({
        roomId: id,
      });

      res.json(result);
    });

    app.post("/api/rooms", verifyToken, async (req, res) => {
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
