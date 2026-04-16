export function requirePinterestAuth(req, res, next) {
    // #region agent log
    fetch('http://127.0.0.1:7740/ingest/018f6636-95c8-4a68-8893-d61f0838f092',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c9cbc7'},body:JSON.stringify({sessionId:'c9cbc7',runId:'pre-fix',hypothesisId:'H4',location:'requirePinterestAuth.js:1',message:'Auth check',data:{hasSession:!!req.session,hasPinterestSession:!!req.session?.pinterest,hasAccessToken:!!req.session?.pinterest?.accessToken,hasCookieHeader:!!req.headers?.cookie,origin:req.headers?.origin||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

    if (!req.session?.pinterest?.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
}
