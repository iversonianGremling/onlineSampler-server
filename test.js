// test.js
const express = require("express");
const app = express();
const router = express.Router();

router.get("/", (req, res) => {
  res.send("Hello World");
});

app.use("/test", router);

app.listen(3000, () => {
  console.log("Test server running on port 3000");
});
