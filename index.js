const express = require('express');
const mp3Routes = require('./routes/audio');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use('/audio', mp3Routes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

