const express = require('express');
const router = express.Router();
const authuser=require('./userauth.route')
const imagegeneration=require('./imagegenration.route')
const imageupload=require('./upload.route')

router.use('/authusers', authuser);
router.use('/image', imagegeneration);
router.use('/imageupload', imageupload);


router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API!' });
});

module.exports = router;
