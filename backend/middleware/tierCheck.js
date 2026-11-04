const User = require('../models/User');

const checkTier = (minimumPlan) => {
  return async (req, res, next) => {
    try {
      // User ID request se ya JWT token se extract karein
      const userId = req.userId || req.user?.id || req.body.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID not found' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const planHierarchy = { 'FREE': 0, 'STARTER': 1, 'PRO': 2, 'ULTIMATE': 3 };
      
      // 🪙 Default plan type fallback
      let activePlanType = user.planType || user.plan || 'FREE';

      // 🔍 Multi-Pack Ledger Check: 
      if (user.currentActivePackId && user.activePacks && user.activePacks.length > 0) {
        const activePack = user.activePacks.id(user.currentActivePackId) || 
                           user.activePacks.find(p => p._id.toString() === user.currentActivePackId.toString());
        if (activePack && activePack.remainingCredits > 0) {
          activePlanType = activePack.planType;
        } else if (user.activePacks.length > 0) {
          
          activePlanType = user.activePacks[0].planType;
        }
      }

      const userPlan = activePlanType.toUpperCase();
      const userTierScore = planHierarchy[userPlan] || 0;
      const requiredTierScore = planHierarchy[minimumPlan.toUpperCase()] || 1;

      if (userTierScore < requiredTierScore) {
        return res.status(403).json({ 
          success: false, 
          message: `🔒 Access Denied! To access this feature, at least ${minimumPlan.toUpperCase()} I need a pack. You have a current active plan. ${userPlan} h.` 
        });
      }

      // User object ko request mein attach kar dein
      req.currentUser = user;
      next();
    } catch (err) {
      console.error('Tier Check Middleware Error:', err);
      res.status(500).json({ success: false, message: 'Server error during plan verification' });
    }
  };
};

module.exports = checkTier;