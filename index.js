const expres = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');
const azure = require('azure-storage');
const app = expres();

app.use(expres.static(path.join(__dirname,'app')));
app.use(bodyParser.json());

const alretsQueueName = "wowalertmessage";
const subscriberQueueName = "wowsubmessage";

const successCd = 200;
const errorCd = 500;

const publicVapidKey = 'BLQUKIB-Tiq4tAtDmVMxMulUmM_rZHkp_OM5sRp_1j42G1DA1RGWX7i70JB0p9W7MOgY6-jFguPmIc7YiP4h93g';
const privateVapidKey = 'NioPoyOmz23Orxh5QOZtQasOZ6Pom4mlGH2bHn7cjXE';


var queueSvc = azure.createQueueService();

webpush.setVapidDetails('mailto:test@test.com', publicVapidKey, privateVapidKey);

//Subcribe route
app.post('/subscribe', (req, res) => {
  //Get Push Subcription object
  //console.log(req);
  const subscription = req.body;

  //send 201 - resource created
  res.status(201).json({});

  //create payload
  const payload = JSON.stringify({ title: 'Successfully Subscribed With Push Notifications' });

  //Pass object into sendnotification function
  queueSvc.createMessage(subscriberQueueName, subscription, function (error, results, response) {
    if (!error) {
      // Message inserted
      status = successCd;
      sendNotification(subscription,payload);
    }
  });
  //sendNotification(subscription,payload);
});


var sendNotification = function(subscription, payload){
  webpush.sendNotification(subscription, payload).catch(err => {
    console.log(err);
  });
}


var sendNotificationForAll = function(){
  queueSvc.getMessages('subscriberQueueName', {numOfMessages: 15, visibilityTimeout: 5 * 60}, function(error, results, getResponse){
    if(!error){
      // Messages retrieved
      for(var index in result){
        // text is available in result[index].messageText
        var message = results[index];
        console.log(message);
        sendNotification(message, JSON.stringify({ title: 'Got a Push Notifications' }));
      }
    }
  });
}
app.get('/', function (req, res) {
  res.sendfile(path.join(__dirname, '/index.html'));
});
app.get('/index', function (req, res) {
  res.sendfile(path.join(__dirname, './index.html'));
});

app.get('/queue', function (req, res) {
  var status = errorCd;
  var msg;
  try{
    msg = req.get('text');
  }catch(err){
    console.log(err);
  }
  if(msg == undefined || msg == null){
    msg = 'SOH Alert';
  }
  queueSvc.createMessage(alretsQueueName, msg, function (error, results, response) {
    if (!error) {
      // Message inserted
      status = successCd;
    }
  });
  res.send(JSON.stringify({
    statusCode: status
  }));
});

app.get('/dqueue', function (req, res) {
  var status = errorCd;
  queueSvc.getMessages(alretsQueueName, function (error, results, response) {
    if (!error) {
      // Message text is in results[0].messageText
      var message = results[0];
      queueSvc.deleteMessage(alretsQueueName, message.messageId, message.popReceipt, function (error, response) {
        if (!error) {
          //message deleted
          status = successCd;
        }
      });
    }
  });
  res.send(JSON.stringify({
    statusCode: status
  }));
});

const port = process.env.PORT || process.env.port || 5000;
app.listen(port, () => console.log(`server start on port ${port} `));

