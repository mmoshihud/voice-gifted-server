const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

const app = express();

app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send("Unauthorized access");
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      //todo message
      return res.status(401).send("Unauthorized access");
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.j1jxfgc.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

async function run() {
  try {
    const userCollection = client.db("summerDB").collection("users");
    const classCollection = client.db("summerDB").collection("classes");
    const cartCollection = client.db("summerDB").collection("carts");
    const paymentCollection = client.db("summerDB").collection("payments");
    const enrolmentCollection = client.db("summerDB").collection("enrollments");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "6h",
      });
      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send("forbidden message");
      }
      next();
    };

    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res.status(403).send("forbidden message");
      }
      next();
    };

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.get("/users/student/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ student: false });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { student: user?.role === "student" };
      res.send(result);
    });

    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "User already exists" });
      }

      const result = await userCollection.insertOne(user);
      console.log(`A user was inserted with the _id: ${result.insertedId}`);
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      console.log(`A user was made as a admin`);
      res.send(result);
    });

    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      console.log(`A user was made as an instructor`);
      res.send(result);
    });

    app.get("/classes", verifyJWT, async (req, res) => {
      const cursor = classCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/classes", verifyJWT, verifyInstructor, async (req, res) => {
      const classData = req.body;
      const result = await classCollection.insertOne(classData);
      console.log(`A class was inserted with the _id: ${result.insertedId}`);
      res.send(result);
    });

    app.get("/class/edit/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const classData = await classCollection.findOne(query);
      res.send(classData);
    });

    app.put("/class/update/:id", async (req, res) => {
      const id = req.params.id;
      const toy = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedToy = {
        $set: {
          name: toy.name,
          image: toy.image,
          price: toy.price,
          availableSeats: toy.availableSeats,
          status: "pending",
        },
      };

      const result = await classCollection.updateOne(
        filter,
        updatedToy,
        options
      );
      res.send(result);
    });

    app.patch("/class/permission/:id", async (req, res) => {
      const id = req.params.id;
      const { permission } = req.body;
      const filter = { _id: new ObjectId(id) };

      if (permission === "approved") {
        const updateDoc = {
          $set: {
            status: "approved",
          },
        };
        const result = await classCollection.updateOne(filter, updateDoc);
        console.log(`Class has been approved`);
        res.send(result);
      } else if (permission === "denied") {
        const updateDoc = {
          $set: {
            status: "denied",
          },
        };
        const result = await classCollection.updateOne(filter, updateDoc);
        console.log(`Class has been denied`);
        res.send(result);
      } else {
        res.status(400).send("Invalid request.");
      }
    });

    app.get(
      "/classes/:email",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const email = req.params.email;
        const cursor = classCollection.find({ instructorEmail: email });
        const result = await cursor.toArray();
        res.send(result);
      }
    );

    app.get("/all-classes", async (req, res) => {
      const query = { status: "approved" };
      const cursor = classCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/carts", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const cursor = cartCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const item = req.body;
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      console.log("Successfully Deleted ID:", id);
      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {
        _id: { $in: payment.cartItems.map((id) => new ObjectId(id)) },
      };
      const deleteResult = await cartCollection.deleteMany(query);

      const updateResult = await classCollection.updateMany(
        { _id: { $in: payment.classItems.map((id) => new ObjectId(id)) } },
        { $inc: { availableSeats: -1 } }
      );

      res.send({ insertResult, deleteResult, updateResult });
    });

    app.get("/payments", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const cursor = paymentCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/enrollments", async (req, res) => {
      const email = req.query.email;
      const query = { studentEmail: email };
      const cursor = enrolmentCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/enrollments/classes", verifyJWT, async (req, res) => {
      const enrollment = req.body;
      const insertResult = await enrolmentCollection.insertOne(enrollment);
      res.send(insertResult);
    });

    app.patch("/feedback/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const feedback = req.body.feedback;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          feedback: feedback,
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      console.log(`A user was made as a admin`);
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(process.env.PORT, () => {
  console.log(`Example app listening on port ${process.env.PORT}`);
});
