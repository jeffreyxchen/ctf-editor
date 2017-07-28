const express = require('express');

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const bodyParser = require('body-parser');
const passport = require('passport');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const LocalStrategy = require('passport-local').Strategy;
const User = require('./models').User;
const Doc = require('./models').Doc;


mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.on('connected', () => {
  console.log('successfully connected to database');
});
mongoose.Promise = global.Promise;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true,
}));

app.use(session({
  secret: 'keyboard cat',
  store: new MongoStore({
    mongooseConnection: mongoose.connection,
  }),
}));

/* PASSPORT SETUP */
passport.use(new LocalStrategy(
  ((username, password, done) => {
    User.findOne({
      username,
    }, (err, user) => {
      if (err) {
        return done(err);
      }
      if (!user) {
        return done(null, false, {
          message: 'Incorrect username.',
        });
      }
      if (user.password !== password) {
        return done(null, false, {
          message: 'Incorrect password.',
        });
      }
      return done(null, user);
    });
  })));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

app.use(passport.initialize());
app.use(passport.session());
/* END OF PASSPORT SETUP */

/* SOCKET SETUP */
io.on('connection', socket => {

  socket.on('join', ({
    doc
  }) => {
    console.log('join', doc);
    socket.emit('back', {
      doc
    });
    socket.join(doc) /// join a room named doc
    socket.theOneRoom = doc;

    socket.broadcast.to(doc).emit('userJoin'); // server sending out event within the room
    // io.sockets.emit('userJoin');
  });

  socket.on('newContent', stringifiedContent => {
    socket.broadcast.to(socket.theOneRoom).emit('receiveNewContent', stringifiedContent);

  });
  socket.on('cursorMove', selection => {
    console.log('selection', selection);
    socket.broadcast.to(socket.theOneRoom).emit('receiveNewCursor', selection);

  });

  socket.on('disconnect', () => {
    console.log('disconnect');
    socket.leave(socket.theOneRoom); /// when user leave the room
    socket.broadcast.to(socket.theOneRoom).emit('userLeft');
  });


})
/* END OF SOCKET SETUP */

app.get('/register', (req, res) => {
  res.send('register');
});
/* AUTH ROUTES */
app.post('/register', (req, res) => {
  console.log(req.body);
  new User({
    username: req.body.username,
    password: req.body.password,
  }).save((err, user) => {
    if (err) {
      res.json({
        success: false,
        error: err,
      });
    } else {
      res.json({
        success: true,
      });
    }
  });
});

app.post('/login', passport.authenticate('local'), (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});
/* END OF AUTH ROUTES */

//
app.get('/getuserdocuments', (req, res) => {
  req.user.populate('documents')
    .execPopulate()
    .then((populatedUser) => {
      res.json({
        success: true,
        userDocs: populatedUser.documents,
      });
    })
    .catch((err) => {
      res.json({
        success: false,
        error: err,
      });
    });
});

app.post('/newdocument', (req, res) => {
  const newDoc = new Doc({
    title: req.body.title,
    owner: req.user.id,
  });
  let docToSendBack;
  newDoc.save()
    .then((savedDoc) => {
      docToSendBack = savedDoc;
      return User.update({
        _id: req.user.id,
      }, {
        $push: {
          documents: savedDoc.id,
        },
      });
    })
    .then(() => {
      res.json({
        success: true,
        newDoc: docToSendBack,
      });
    })
    .catch((err) => {
      res.json({
        success: false,
        error: err,
      });
    });
});

app.post('/savedocument/:docId', (req, res) => {
  console.log(req.params.docId);
  Doc.update({
      _id: req.params.docId,
    }, {
      $set: {
        content: req.body.content,
      },
    })
    .then(() => {
      res.json({
        success: true,
      });
    })
    .catch((err) => {
      res.json({
        success: false,
        error: err,
      });
    });
});

app.get('/getdocument/:docId', (req, res) => {
  Doc.findById(req.params.docId)
    .then((foundDoc) => {
      res.json({
        success: true,
        document: foundDoc,
      });
    })
    .catch((err) => {
      res.json({
        success: false,
        error: err,
      });
    });
});

app.get('/addshareddoc/:docId', (req, res) => {
  // To be fully correct, this route should also check that it isn't adding a duplicate
  User.update({
      _id: req.user.id,
    }, {
      $push: {
        documents: req.params.docId,
      },
    })
    .then(() => {
      res.json({
        success: true,
      });
    })
    .catch((err) => {
      res.json({
        success: false,
        error: err,
      });
    });
});


server.listen(3000, () => {
  console.log('Backend server for Electron App running on port 3000!');
});
