const isAuthenticated = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const [header, payload, signature] = token.split('.');
    
    if (!header || !payload || !signature) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    try {
      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());
      
      const currentTime = Math.floor(Date.now() / 1000);

      if (decodedPayload.exp && decodedPayload.exp < currentTime) {
        return res.status(401).json({ error: 'Token has expired' });
      }

      req.user = {
        id: decodedPayload.sub,
        email: decodedPayload.email,
        role: decodedPayload.role
      };

      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Authentication error' });
  }
};

module.exports = isAuthenticated; 