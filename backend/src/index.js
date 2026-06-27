require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/staff', require('./routes/staff'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/patients/:patientId/notes', require('./routes/notes'));

app.use((err, req, res, next) => {
  console.error(err);

  if (err.status === 401) {
    return res.status(401).json({ error: 'Invalid or missing token' });
  }
  if (err.status === 403) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
