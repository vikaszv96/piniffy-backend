export function requirePinterestAuth(req, res, next) {
    console.log("requirePinterestAUth = ", req.session?.pinterest);
    if (!req.session?.pinterest?.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
}
