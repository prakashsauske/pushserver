const expres = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');
const azure = require('azure-storage');
//const botbuilder_azure = require("botbuilder-azure");
const app = expres();

app.use(expres.static(path.join(__dirname, 'app')));
app.use(bodyParser.json());
app.disable('etag');
const alretsQueueName = "wow-msg-queue";
const subscriberQueueName = "wow-msg-queue-poison";

const successCd = 201;
const errorCd = 500;

const publicVapidKey = 'BLQUKIB-Tiq4tAtDmVMxMulUmM_rZHkp_OM5sRp_1j42G1DA1RGWX7i70JB0p9W7MOgY6-jFguPmIc7YiP4h93g';
const privateVapidKey = 'NioPoyOmz23Orxh5QOZtQasOZ6Pom4mlGH2bHn7cjXE';
/* const blobStorage = new botbuilder_azure.BlobStorage({
  containerName: 'firstbotblog',
  storageAccessKey: process.env.STORAGEKEY,
  storageAccountOrConnectionString: 'DefaultEndpointsProtocol=https;AccountName=firstbotblog;AccountKey=H+/1D+WykGbvVD0PJ3E0HAx5Pu53mJtJ67MhPEdegFGs1dx4w4lmAU+VSraTAUiovx9jChE4TNA86FEUC3g2gA==;EndpointSuffix=core.windows.net'
}); */

//var queueSvc = azure.createQueueService();
var retryOperations = new azure.ExponentialRetryPolicyFilter();
var queueSvc = azure.createQueueService().withFilter(retryOperations);
var tableSvc = azure.createTableService();
webpush.setVapidDetails('mailto:test@test.com', publicVapidKey, privateVapidKey);
let router = expres.Router();

router.get('/', function (req, res) {
  res.sendfile(path.join(__dirname, '/index.html'));
});

router.get('/queue', (req, res) => {
  var status = 500;
  var msg;
  try {
    msg = req.get('text');
  } catch (err) {
    console.log(err);
  }
  if (msg == undefined || msg == null) {
    msg = 'SOH Alert';
  }
  console.error('alretsQueueName' + alretsQueueName);
  queueSvc.createMessage(alretsQueueName, msg, function (error, results, response) {
    console.error('error = ' + error);
    console.error('results = ' + JSON.stringify(results));
    console.error('response = ' + JSON.stringify(response));
    if (!error) {
      // Message inserted
      sendNotificationForAll();
      status = 201;
      res.status(200).json({
        statusCode: status
      });

    }
  });
});

router.get('/viewTbl', (req, res) => {
  var status = 200;

  console.error('viewTbl');
  getSubscriptionFromTbl();
  res.status(200).json({
    statusCode: status
  });
});

router.get('/dqueue', function (req, res) {
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

app.use('/', router);

//Subcribe route
router.post('/subscribe', (req, res) => {
  //Get Push Subcription object
  //console.log(req);
  const subscription = req.body;

  //create payload
  const payload = JSON.stringify({ title: 'Successfully Subscribed With Push Notifications' });

  console.error(subscription);
  //console.error(subscriberQueueName);
  saveSubscriptionInTbl(subscription);
  //Pass object into sendnotification function
  queueSvc.createMessage("wow-sub-message", JSON.stringify(subscription), function (error, results, response) {
    console.error(error);

    if (!error) {
      // Message inserted
      status = successCd;
      sendNotification(subscription, payload);
    }
  });
  //sendNotification(subscription,payload);
  //send 201 - resource created
  res.status(201).json({});
});

router.post('/deleteSubscription', (req, res) => {
  //Get Push Subcription object
  //console.log(req);
  const data = req.body;
  try {
    if (data && JSON.parse(data)) {
      var result = JSON.parse(data);
      for (var index in result.entries) {
        // text is available in result[index].messageText
        var message = result.entries[index];
        console.error('message' + message);
        try {
          console.error(message.PartitionKey);
          console.error(message.RowKey);
          var task = {
            PartitionKey: {'_':message.PartitionKey},
            RowKey: {'_': message.RowKey}
          };
          
          tableSvc.deleteEntity('userSubscription', task, function(error, response){
            if(!error) {
              // Entity deleted
              console.error('entry deleted')
            }
          });
        } catch (err) {
          console.error(err);
        }
      }
    }
  } catch (err) {
    console.error(err);
  }

  //send 201 - resource created
  res.status(201).json({});
});

var saveSubscriptionInTbl = function (subscription) {
  var entGen = azure.TableUtilities.entityGenerator;
  var task = {
    PartitionKey: entGen.String('subscriptionInfo'),
    RowKey: entGen.String(subscription.endpoint),
    description: entGen.String('subscription'),
    data: entGen.String(JSON.stringify(subscription)),
    dueDate: entGen.DateTime(new Date(Date.UTC(2015, 6, 20))),
  };
  tableSvc.insertEntity('userSubscription', task, function (error, result, response) {
    if (!error) {
      // Entity updated
      console.error('entry inserted')
    } else {
      console.error(error);
      console.error('entry failed');
    }
  });
}

var getSubscriptionFromTbl = function () {
  var query = new azure.TableQuery()
    .top(5)
    .where('PartitionKey eq ?', 'subscriptionInfo');
  tableSvc.queryEntities('userSubscription', query, null, function (error, result, response) {
    if (!error) {
      // query was successful
      console.error(result.entries);
      console.error('R1 =' + result.entries);

      if (result.entries) {
        for (var index in result.entries) {
          // text is available in result[index].messageText
          var message = result.entries[index];
          console.error('message' + message);
          try {
            console.error(message.data);
            console.error(message.data['_']);
            if (JSON.parse(message.data['_']).endpoint) {
              sendNotification(JSON.parse(message.data['_']), JSON.stringify({ title: 'Got a Push Notifications' }));
            }
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
  });
}

var sendNotification = function (subscription, payload) {
  console.error('subscription' + subscription);
  webpush.sendNotification(subscription, payload).catch(err => {
    console.error('sendNotification' + err);
  });
}


var sendNotificationForAll = function () {
  queueSvc.getMessages("wow-sub-message", { numOfMessages: 15, visibilityTimeout: 20 * 60 * 60 }, function (error, results, getResponse) {
    if (!error) {
      // Messages retrieved
      if (!results) {
        for (var index in results) {
          // text is available in result[index].messageText
          var message = results[index];
          console.error('message' + message);
          try {
            if (JSON.parse(message.messageText).endpoint) {
              sendNotification(JSON.parse(message.messageText), JSON.stringify({ title: 'Got a Push Notifications' }));
            }
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
  });
}

/* 
const uploadString = async (containerName, blobName, text) => {
  return new Promise((resolve, reject) => {
    blobService.createBlockBlobFromText(containerName, blobName, text, err => {
      if (err) {
        reject(err);
      } else {
        resolve({ message: `Text "${text}" is written to blob storage` });
      }
    });
  });
};
 */

const port = process.env.PORT || process.env.port || 5000;
app.listen(port, () => console.log(`server start on port ${port} `));

