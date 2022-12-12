const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
// const stripe = require('stripe')(process.env.SECRET_KEY);
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lfwra.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();

    const serviceCollection = client.db("doctors-portal").collection("services");
    const bookingCollection = client.db("doctors-portal").collection("booking");
    const userCollection = client.db("doctors-portal").collection("user");
    const doctorCollection = client.db('doctors-portal').collection('doctors');
    const diseaseCollection = client.db('doctors-portal').collection('diseases');

    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get('/user', verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });
    app.get('/user/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({email: email});
      res.send(user);
    });

    app.get('/admin/:email', async(req, res) =>{
      const email = req.params.email;
      const user = await userCollection.findOne({email: email});
      const isAdmin = user.role === 'admin';
      res.send({admin: isAdmin})
    })
    app.get('/make-doctor/:email', async(req, res) =>{
      const email = req.params.email;
      const user = await userCollection.findOne({email: email});
      const isDoctor = user?.role === 'doctor';
      res.send({doctor: isDoctor})
    })
    

    app.put('/user/make-doctor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'doctor' },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
      else{
        res.status(403).send({message: 'forbidden'});
      }

    })

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
      res.send({ result, token });
    });
    app.delete('/user/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await userCollection.deleteOne(filter);
      res.send(result);
    });
    

    app.get("/available", async (req, res) => {
      const date = req.query.date || "May 11, 2022";
      const services = await serviceCollection.find().toArray();

      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();
      services.forEach((service) => {
        // step 4: find bookings for that service. output: [{}, {}, {}, {}]
        const serviceBookings = bookings.filter((book) => book.treatment === service.name);
        // step 5: select slots for the service Bookings: ['', '', '', '']
        const bookedSlots = serviceBookings.map((book) => book.slot);
        // step 6: select those slots that are not in bookedSlots
        const available = service.slots.filter((slot) => !bookedSlots.includes(slot));
        //step 7: set available to slots to make it easier
        service.slots = available;
      });
      res.send(services);
    });

    app.get("/booking", verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      }
      else {
        return res.status(403).send({ message: 'forbidden access' });
      }
    })

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient , fee: booking.fee};
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });
    app.get('/doctor', async(req, res) =>{
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    })

    app.post('/doctor', verifyJWT, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });
    app.delete('/doctor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = {email: email};
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    })

    //disease
    app.get('/diseases', async(req, res) =>{
      const diseases = await diseaseCollection.find().toArray();
      res.send(diseases);
    })

    app.post('/diseases', verifyJWT, async (req, res) => {
      const diseases = req.body;
      const result = await diseaseCollection.insertOne(diseases);
      res.send(result);
    });
    app.delete('/diseases/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = {_id: ObjectId(id)};
      const result = await diseaseCollection.deleteOne(filter);
      res.send(result);
    })

    //payment

    // app.post('/create-payment-intent', verifyJWT, async(req, res) =>{
    //   const service = req.body;
    //   const price = service.price;
    //   const amount = price*100;
    //   const paymentIntent = await stripe.paymentIntents.create({
    //     amount : amount,
    //     currency: 'usd',
    //     payment_method_types:['card']
    //   });
    //   res.send({clientSecret: paymentIntent.client_secret})
    // });


  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Running Doctors Portal");
});

app.listen(port);
