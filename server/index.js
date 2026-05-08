const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const authRoutes = require('./routes/auth');
const registreRoutes = require('./routes/registre');
const telephoneRoutes = require('./routes/telephone');
const calendarRoutes = require('./routes/calendar');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', database: process.env.POSTGRES_URL ? 'postgres' : 'sqlite' }));

// Prevent caching for API routes
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/registre', registreRoutes);
app.use('/api/execution', require('./routes/execution'));
app.use('/api/cnss', require('./routes/cnss'));
app.use('/api/telephone', telephoneRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/users', require('./routes/users'));
app.use('/api/portal', require('./routes/portal'));
app.use('/api/data-cleaning', require('./routes/data-cleaning'));

// Settings — after update, flush TVA cache in registre
app.use('/api/settings', (req, res, next) => {
    res.on('finish', () => {
        if (req.method === 'PUT' && res.statusCode < 300) {
            // Refresh TVA cache whenever any setting is changed
            registreRoutes.refreshTVA && registreRoutes.refreshTVA();
        }
    });
    next();
}, settingsRoutes);

// Export for Vercel
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
