require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const routes = require('./src/routes/index.route');
const connectDB = require('./src/config/database');

const app = express();

require('./src/jobs/cleanupjob');
connectDB();

app.use(cors());
app.use(morgan('dev'));
app.use(helmet());
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("running");
});

// Routes
app.use('/api', routes);

// 404 Error
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});


// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server Error' });
});

// Start server
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
