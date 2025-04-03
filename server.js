const express = require('express');
const app = express();
const port = 3000;

app.use(express.static('.')); // Serve static files from the current directory

app.get('/api/username', (req, res) => {
  const randomUsername = 'Player' + Math.floor(Math.random() * 1000); // Generate a random username
  res.send(randomUsername); // Send the generated username
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
