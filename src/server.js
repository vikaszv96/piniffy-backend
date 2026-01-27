// import dotenv from 'dotenv';
// dotenv.config();

// import app from './app.js';

// const PORT = process.env.PORT || 4000;

// app.listen(PORT, () => {
//     console.log(`🚀 Piniffy backend running on port ${PORT}`);
// });

if (process.env.NODE_ENV !== 'production') {
    const dotenv = await import('dotenv');
    dotenv.config();
}

import app from './app.js';

const PORT = process.env.PORT;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Piniffy backend running on port ${PORT}`);
});
