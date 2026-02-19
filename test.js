const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

app.get('/api/v0/health', (_, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'ECAD API is running',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`ECAD API server is running on port ${PORT}`);
});
