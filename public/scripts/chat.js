(function($){
  const NICKNAME_MAX_LENGTH = 15,
        CHANNEL_MAX_LENGTH  = 20;

  var enableEffect = false;

  var client = null,
      nickname = null,
      belong = null,
      isPrivate = false;

  var template = {
    'channel': [
      '<li data-channelId="${channel}">',
      '<span class="icon"></span> ${channel} <div style="${style}"><img src="images/private.png"/></div>',
      '</li>'
    ].join(""),
    'user': [
      '<li data-userId="${userId}" class="cf">',
      '<div class="fl userName"><span class="icon"></span> ${nickname}</div>',
      '<div class="fr composing"></div>',
      '</li>'
    ].join(""),
    'message': [
      '<li class="cf">',
      '<div class="fl sender">${sender}: </div><div class="fl text">${text}</div><div class="fr time">${time}</div>',
      '</li>'
    ].join(""),
    'image': [
      '<li class="cf">',
      '<div class="fl sender">${sender}: </div><div class="fl image"><canvas style="margin-left: 20px" class="img_uploaded"></canvas></div><div class="fr time">${time}</div>',
      '</li>'
    ].join("")
  };

  // Handle the client nickname
  function nicknameHandler()
  {
    let name = $('#nickname-popup .input input').val().trim();

    if (name && name.length <= NICKNAME_MAX_LENGTH)
    {
      nickname = name;

      Avgrund.hide();
      connect();
    }
    else
    {
      $('#nickname-popup .input input').val('');
    }
  }

  // Handle the client messages
  function messageHandler()
  {
    let message = $('.chat-input input').val().trim();

    if (message)
    {
      let json = JSON.stringify({
        'nickname' : nickname,
        'message' : message
      });

      let messageObject = new Messaging.Message(json);
      messageObject.destinationName = belong;
      client.send(messageObject);

      $('.chat-input input').val('');
    }
  }

  // Handler the client attachment (image)
  function attachHandler(files, callback)
  {
    for (let i = 0; i < files.length; ++i)
    {
      let reader =  new FileReader();
      reader.onloadend = function(event) {
        let json = JSON.stringify({
          'nickname' : nickname,
          'message' : event.target.result,
          'type' : 'image'
        });
        let messageObject = new Messaging.Message(json);
        messageObject.destinationName = belong;
        client.send(messageObject);
      };

      reader.readAsDataURL(files[i]);
    }

    callback();
  }

  function insertMessage(sender, message, showTime, is_me, is_server)
  {
    let $html = $.tmpl(template.message, {
      'sender' : sender,
      'text' : message,
      'time' : (showTime) ? getTime() : ''
    });

    setMessage($html, is_me, is_server);
  }

  function setMessage(html, is_me, is_server)
  {
    if (is_me) html.addClass('marker');
    if (is_server) html.find('.sender').css('color', '#1c5380');

    html.appendTo('.chat-messages ul');
    $('.chat-messages').animate({
      'scrollTop' : $('.chat-messages ul').height()
    }, 100);
  }

  function insertImage(sender, message, showTime, is_me, is_server)
  {
    let $html = $.tmpl(template.image, {
      'sender' : sender,
      'time' : (showTime) ? getTime() : ''
    });

    let canvas = $html.find('.img_uploaded')[0];
    let context = canvas.getContext('2d');

    let image = new Image();
    image.src = message;
    image.onload = function() { context.drawImage(image, 0, 0, 200, 200); };

    setMessage($html, is_me, is_server);
  }

  function padding(value)
  {
    return (value < 10) ? '0' + value : value;
  }

  function getTime()
  {
    let date = new Date();

    let hour = padding(date.getHours());
    let min = padding(date.getMinutes());
    let sec = padding(date.getSeconds());

    return hour + ':' + min + ':' + sec;
  }

  // for shake effect
  function shake_effect(container, input, effect, bgColor)
  {
    if (!enableEffect)
    {
      enableEffect = true;

      $(container).addClass(effect);
      $(input).addClass(bgColor);

      window.setTimeout(function() {
        $(container).removeClass(effect);
        $(input).removeClass(bgColor);
        $(input).focus();

        enableEffect = false;
      }, 1000);
    }
  }

  // Channel
  function createChannel()
  {
    let channel = $('#addchannel-popup .input input').val().trim();
    let protect = $('#passwordProtected').prop('checked');

    if (protect && !$('#password').val()) {}
    else if  (channel && channel.length <= CHANNEL_MAX_LENGTH && channel != belong)
    {
      if (protect)
      {
        let password = protect ? $('#password').val() : undefined;

        $.post('/private', {
          'channel' : channel,
          'password' : password
        }).done(function(data) {
          onChannelCreated(channel, protect);
        });
      }
      else onChannelCreated(channel, protect);
    }
    else $('#addchannel-popup .input input').val('');
  }

  function onChannelCreated(channel, protect)
  {
    $('.chat-shadow').show().find('.content').html('채널 생성중..');
    $('.chat-shadow').animate({ 'opacity' : 1 }, 200);

    client.unsubscribe(belong);
    client.subscribe(channel);

    Avgrund.hide();
    let json = JSON.stringify({
      'channel' : channel,
      'nickname' : nickname,
      'private' : protect
    });
    let messageObject = new Messaging.Message(json);
    messageObject.destinationName = 'createchannel';
    client.send(messageObject);

    initialize(channel, protect);
  }

  function addChannel(name, announce, is_private)
  {
    let style = 'display: ' + (is_private ? 'inline' : 'none');

    if ($('.chat-channels ul li[data-channelId="' + name + '"]').length === 0)
    {
      $.tmpl(template.channel, {
        'channel' : name,
        'style' : style
      }).appendTo('.chat-channels ul');

      if (announce) insertMessage('서버', name + '채널이 생성되었습니다.', true, false, true);
    }
  }

  function removeChannel(name, announce)
  {
    $('.chat-channels ul li[data-channelId="' + name + '"]').remove();

    if (announce) insertMessage('서버', name + '채널이 제거되었습니다.', true, false, true);
  }

  function setCurrentChannel(channel, is_private)
  {
    belong = channel;
    isPrivate = is_private;

    $('.chat-channels ul li.selected').removeClass('selected');
    $('.chat-channels ul li[data-channelId="' + channel + '"]').addClass('selected');
  }

  // Client (User)
  function addClient(client, announce, myself)
  {
    let $html = $.tmpl(template.user, client);

    if (myself) $html.addClass('myself');
    if ($('.chat_users ul l i[data-userId="' + client.clientId + '"]').length === 0) $html.appendTo('.chat-users ul');
  }

  function removeClient(client)
  {
    $('.chat_users ul l i[data-userId="' + client.clientId + '"]').remove();
  }

  // connect
  function connect()
  {
    $('.chat-shadow .content').html('연결중...');

    client = new Messaging.Client('localhost', 1884, nickname);
    client.connect({
      'onSuccess': onConnect,
      'keepAliveInterval': 0
    });
    client.onMessageArrived = onMessageArrived;
  }

  function onConnect()
  {
    $('.chat-shadow').animate({'opacity': 0}, 200, function() {
      $(this).hide();

      $('.chat input').focus();
    });

    belong = 'Lobby';
    isPrivate = false;

    client.subscribe(belong);
    client.subscribe('createchannel');
    client.subscribe('removechannel');
    client.subscribe('totalchannels');
    client.subscribe('totalclients');
    client.subscribe('online');
    client.subscribe('offline');

    initialize(belong);
  }

  function onMessageArrived(message)
  {
    let json = JSON.parse(message.payloadString);
    let topic = message.destinationName;

    console.log(json);

    if (topic == 'createchannel')
    {
      if (json.nickname != nickname) insertMessage('서버', '채널' + json.channel + '이 생성되었습니다.', true, false, true);
    }
    else if (topic == 'removechannel')
    {
      removeChannel(json.channel, false);
    }
    else if (topic == 'online')
    {
      if (json.nickname != nickname && json.channel == belong) insertMessage('서버', json.nickname + '님이 접속하였습니다.', true, false, true);
    }
    else if (topic == 'offline')
    {
      if (json.nickname != nickname && json.channel == belong)
      {
        insertMessage('서버', json.nickname + '님이 나갔습니다.', true, false, true);
        removeClient(json.nickname);
      }
    }
    else if (topic == 'totalchannels')
    {
      for (let i = 0, length = json.length; i < length; ++i)
      {
        if (json[i]._id && json[i]._id !== '')
        {
          let protect = json[i].private === undefined ? false : json[i].private;

          addChannel(json[i]._id, false, protect);
        }
      }
    }
    else if (topic == 'totalclients')
    {
      for (let i = 0, length = json.length; i < length; i++)
      {
        if (json[i]._id && json[i]._id == belong)
        {
          for (let j = 0, length2 = json[i].clientIds.length; j < length2; ++j)
          {
            if (json[i].clientIds[j] && json[i].clientIds[j] != nickname)
            {
              addClient({
                'nickname' : json[i].clientIds[j],
                'clientId' : json[i].clientIds[j]
              }, false);
            }
          }

          break;
        }
      }
    }
    else
    {
      if (json.type === 'image') insertImage(json.nickname, json.message, true, json.nickname == nickname, false);
      else insertMessage(json.nickname, json.message, true, json.nickname == nickname, false);
    }
  }

  function initialize(channel, is_private)
  {
    addChannel(channel, false, is_private);
    setCurrentChannel(channel, is_private);

    insertMessage('서버', '안녕하세요! 매너있는 채팅 부탁드립니다!', true, false, true);

    $('.chat-users ul').empty();
    addClient({
      'nickname': nickname,
      'clientId': nickname
    }, false, true);

    $('.chat-shadow').animate({ 'opacity': 0 }, 200, function()  {
      $(this).hide();

      $('.chat input').focus();
    });
  }

  function switching(channel)
  {
    setCurrentChannel(channel);
    insertMessage('서버', channel + ' 채널에 오신 것을 환영합니다!', true, false, true);

    $('.chat-users ul').empty();
    addClient({
      'nickname': nickname,
      'clientId': nickname
    }, false, true);

    $('.chat-shadow').animate({ 'opacity': 0 }, 200, function()  {
      $(this).hide();

      $('.chat input').focus();
    });
  }

  // attach dom events
  $(function() {
    $('.chat-input input').on('keydown', function(event) {
      let keycode = event.which || event.keyCode;

      if (keycode === 13) messageHandler();
    });

    $('.chat-submit button').on('click', function() {
      messageHandler();
    });

    $('.chat-attach input').on('change', function() {
      let uploadedFiles = this.files;

      attachHandler(uploadedFiles, function() { this.files = undefined; });
    });

    // start chat
    $('.button.start').on('click', function() {
      $('nickname-popup .input input').val('');

      Avgrund.show('#nickname-popup');
      window.setTimeout(function() { $('nickname-popup .input input').focus(); }, 100);
    });

    $('#nickname-popup .input input').on('keydown', function(event) {
      let keycode = event.which || event.keyCode;

      if (keycode === 13) nicknameHandler();
    });

    $('#nickname-popup .join').on('click', function() {
      nicknameHandler();
    });

    $('#addchannel-popup .input input').on('keydown', function(event) {
      let keycode = event.which || event.keyCode;
      if (keycode === 13) createChannel();
    });

    $('#addchannel-popup .create').on('click', function() {
      createChannel();
    });

    $('.chat-channels .title-button').on('click', function() {
      $('#addchannel-popup .input input').val('');

      Avgrund.show('#addchannel-popup');
      window.setTimeout(function() { $('#addchannel-popup .input input').focus(); }, 100);
    });

    $('.chat-channels ul').on('scroll', function() {
      $('.chat-channels ul li.selected').css('top', $(this).scrollTop());
    });

    $('.chat-channels ul li').live('click', function(){
        var channel = $(this).attr('data-channelId');
        var isPrivate = $($(this).children('div')[0]).css('display') === 'inline';

        if (channel != belong)
        {
          if (isPrivate)
          {
            $('#password-popup .input input').val('');
            $('#password-popup .channel-name').val(channel);
            $('#password-popup .popup-title').text('비밀번호를 입력하세요.');

            Avgrund.show('#password-popup');
            window.setTimeout(function() { $('#password-popup .input input').focus(); }, 100);
          }
          else
          {
            client.unsubscribe(belong);
            client.subscribe(belong);

            switching(channel);
          }
        }
    });

    $('.chat-messages').on('scroll', function() {
      var self = this;

      window.setTimeout(function() {
        if($(self).find('ul').height() > $(self).scrollTop() + $(self).height()) $(self).addClass('scroll');
        else $(self).removeClass('scroll');
      }, 50);
    });
  });

})(jQuery);
