const expres = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');
const azure = require('azure-storage');
const app = expres();

app.use(expres.static(path.join(__dirname,'app')));
app.use(bodyParser.json());

const alretsQueueName = "wow-msg-queue";
const subscriberQueueName = "wow-sub-message";

const successCd = 200;
const errorCd = 500;

const publicVapidKey = 'BLQUKIB-Tiq4tAtDmVMxMulUmM_rZHkp_OM5sRp_1j42G1DA1RGWX7i70JB0p9W7MOgY6-jFguPmIc7YiP4h93g';
const privateVapidKey = 'NioPoyOmz23Orxh5QOZtQasOZ6Pom4mlGH2bHn7cjXE';


//var queueSvc = azure.createQueueService();
var retryOperations = new azure.ExponentialRetryPolicyFilter();
var queueSvc = azure.createQueueService().withFilter(retryOperations);

webpush.setVapidDetails('mailto:test@test.com', publicVapidKey, privateVapidKey);

//Subcribe route
app.post('/subscribe', (req, res) => {
  //Get Push Subcription object
  //console.log(req);
  const subscription = req.body;

  //create payload
  const payload = JSON.stringify({ title: 'Successfully Subscribed With Push Notifications' });

  console.error(subscription);
  console.error(subscriberQueueName);

  //Pass object into sendnotification function
  queueSvc.createMessage(subscriberQueueName, JSON.stringify(subscription), function (error, results, response) {
  console.error(error);

    if (!error) {
      // Message inserted
      status = successCd;
      sendNotification(subscription,payload);
    }
  });
  //sendNotification(subscription,payload);
  //send 201 - resource created
  res.status(201).json({});
});


var sendNotification = function(subscription, payload){
  console.error('subscription'+ subscription);
  webpush.sendNotification(subscription, payload).catch(err => {
    console.error('sendNotification'+err);
  });
}


var sendNotificationForAll = function(){
  queueSvc.getMessages(subscriberQueueName, {numOfMessages: 15, visibilityTimeout: 20 * 60 * 60}, function(error, results, getResponse){
    if(!error){
      // Messages retrieved
      if(!results){
        for(var index in results){
          // text is available in result[index].messageText
          var message = results[index];
          console.error('message'+message);
          sendNotification(JSON.parse(message.messageText), JSON.stringify({ title: 'Got a Push Notifications' }));
        }
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
  console.error('alretsQueueName'+alretsQueueName);
  queueSvc.createMessage(alretsQueueName, JSON.stringify({notify:msg}), function (error, results, response) {
    console.error(error);
    if (!error) {
      // Message inserted
      status = successCd;
    }
  });
  console.error('msg'+msg);
 /*  
  queueSvc.createMessage(alretsQueueName, JSON.stringify({notify:msg}), function (error, results, response) {
    console.error(error);
    if (!error) {
      // Message inserted
      status = successCd;
    }
  });
  console.error('msg'+msg);
  sendNotificationForAll(); */
  res.status(200).json({
    statusCode: status
  });
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
  res.status(201).json({
    statusCode: status
  });
});

const port = process.env.PORT || process.env.port || 5000;
app.listen(port, () => console.log(`server start on port ${port} `));

