(function($){
  const NICKNAME_MAX_LENGTH = 15,
        ROOMNAME_MAX_LENGTH  = 20;

  const ReservedTopics = ['createroom', 'removeroom', 'totalrooms', 'totlausers', 'online', 'offline'];

  var enableEffect = false;

  var client = null,
      nickname = null,
      belong = null,
      isPrivate = false;

  var template = {
    'room': [
      '<li data-roomID="${room}">',
      '<span class="icon"></span> ${room} <div style="${style}"><img src="./images/private.png"></div>',
      '</li>'
    ].join(""),
    'user': [
      '<li data-userID="${user}" class="cf">',
      '<div class="fl userName"><span class="icon"></span> ${nickname}</div>',
      '<div class="fr composing"></div>',
      '</li>'
    ].join(""),
    'message': [
      '<li class="cf">',
      '<div class="fl sender">${sender}: </div><div class="fl text">${text}</div><div class="fr time">${time}</div>',
      '</li>'
    ].join(""),
    'notice': [
      '<li class="cf">',
      '<div class="fl text"><img src="./images/notice.gif"> ${text}</div>',
      '</li>'
    ].join(""),
    'image': [
      '<li class="cf">',
      '<div class="fl sender">${sender}: </div><div class="fl image"><canvas class="img_uploaded"></canvas></div><div class="fr time">${time}</div>',
      '</li>'
    ].join("")
  };

  function addRoom(name, notify, protect)
  {
    let style = 'display: ' + (protect ? 'inline' : 'none');

    if ($('.chat-rooms ul li[data-roomID="' + name + '"]').length === 0)
    {
      $.tmpl(template.room, {
        'room' :  name,
        'style' : style
      }).appendTo('.chat-rooms ul');

      if (notify) insertServerMeesage(name + ' 채팅방이 생성되었습니다.');
    }
  }

  function removeRoom(name, notify)
  {
    $('.chat-rooms ul li[data-roomID="' + name + '"]').remove();

    if (notify) insertServerMeesage(name + ' 채팅방이 삭제되었습니다.');
  }

  function addUser(user, notify, myself)
  {
    let html = $.tmpl(template.user, {
      'user' : user.clientID,
      'nickname' : user.nickname
    });

    if (myself) html.addClass('myself');
    if ($('.chat-users ul li[data-userID="' + user.clientID + '"]').length === 0) html.appendTo('.chat-users ul');
  }

  function removeUser(user)
  {
    $('.chat-users ul li[data-userID="' + user + '"]').remove();
  }

  function createRoom()
  {
    let room = $('#room-popup .input input').val().trim();
    let protect = $('#private').prop('checked');

    if (protect && !$('#password').val()) effect('#room-popup', '#room-popup .input input', 'tada', 'dangerous');
    else if (room &&  room.length <= ROOMNAME_MAX_LENGTH && room != belong && ReservedTopics.indexOf(room) === -1)
    {
      if (protect)
      {
        let password = (protect) ? $('#password').val() : undefined;

        $.post('./create', {
          'room' : room,
          'password' : password
        }).done(function(data) {
          onSuccessRoomCreation(room, protect);
        });
      }
      else  onSuccessRoomCreation(room, protect);
    }
    else
    {
      effect('#room-popup', '#room-popup .input input', 'tata', 'dangerous');

      $('#room-popup .input input').val('');
    }
  }

  function onSuccessRoomCreation(room, protect)
  {
    $('.chat-shadow').show().find('.content').html(room + ' 채팅방을 생성하고 있습니다.');
    $('.chat-shadow').animate({
      'opacity' : 1
    }, 200);

    client.unsubscribe(belong);
    client.subscribe(room);

    Avgrund.hide();

    let json = JSON.stringify({
      'room' : room,
      'nickname' : nickname,
      'private' : protect
    });
    let messageObject = new Messaging.Message(json);
    messageObject.destinationName = 'createroom';

    client.send(messageObject);

    initializeRoom(room, protect);
  }

  function setRoom(room, protect)
  {
    belong = room;
    isPrivate = protect;

    $('.chat-rooms ul li.selected').removeClass('selected');
    $('.chat-rooms ul li[data-roomID="' + room + '"]').addClass('selected');
  }

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
      effect('#nickname-popup', '#nickname-popup .input input', 'tada', 'dangerous');

      $('#nickname-popup .input input').val('');
    }
  }

  function passwordHander()
  {
    let room = $('#password-popup .room-name').val();
    let password = $('password-popup .input input').val();

    if (password)
    {
      $.post('./check', {
        'room' : room,
        'password' : password
      }).done(function(data) {
        Avgrund.hide();

        client.unsubscribe(belong);
        client.subscribe(room);

        switchRoom(room);
      }).fail(function(error) {
        effect('#password-popup', '#password-popup .input input', 'tada', 'dangerous');

        $('#password-popup .input input').val('');
      });
    }
    else
    {
      effect('#password-popup', '#password-popup .input input', 'tada', 'dangerous');

      $('#password-popup .input input').val('');
    }
  }

  function messageHandler()
  {
    let content = $('.chat-input input').val().trim();

    if (content)
    {
      let json = JSON.stringify({
        'nickname' : nickname,
        'message' : content
      });
      let messageObject = new Messaging.Message(json);
      messageObject.destinationName = belong;

      client.send(messageObject);

      $('.chat-input input').val('');
    }
    else effect('.chat', '.chat input', 'wobble', 'dangerous');
  }

  function attachmentHandler(files, callback)
  {
    for (let i = 0; i < files.length; ++i)
    {
      let reader = new FileReader();
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

  function insertMessage(from, message, showTime, myself)
  {
    let html = $.tmpl(template.message, {
      'sender' : from,
      'text' : message,
      'time' : (showTime) ? getTime() : ''
    });

    if (myself) html.addClass('marker');

    html.appendTo('.chat-messages ul');
    $('.chat-messages').animate({
      'scrollTop' : $('.chat-messages ul').height()
    }, 100);
  }

  function insertServerMeesage(message)
  {
    let html = $.tmpl(template.notice, {
      'text' : message
    });

    html.addClass('system');

    html.appendTo('.chat-messages ul');
    $('.chat-messages').animate({
      'scrollTop' : $('.chat-messages ul').height()
    }, 100);
  }

  function insertImage(from, source, showTime, myself)
  {
    let html = $.tmpl(template.image, {
      'sender' : from,
      'time' : (showTime) ? getTime() : ''
    });

    let canvas = html.find('.img_uploaded')[0],
        context = canvas.getContext('2d');

    let image = new Image();
    image.src = source;
    image.onload = function() {
      context.drawImage(image, 0, 0, 200, 200);
    };

    if (myself) html.addClass('marker');

    html.appendTo('.chat-messages ul');
    $('.chat-messages').animate({
      'scrollTop' : $('.chat-messages ul').height()
    }, 100);
  }

  function getTime()
  {
    let date = new Date();

    let hour = (date.getHours() < 10) ? '0' + date.getHours() : date.getHours(),
        min = (date.getMinutes() < 10) ? '0' + date.getMinutes() : date.getMinutes(),
        sec = (date.getSeconds() < 10) ? '0' + date.getSeconds() : date.getSeconds();

    return hour + ':' + min + ':' + sec;
  }

  function effect(container, input, effect, style)
  {
    if (!enableEffect)
    {
      enableEffect = true;

      $(container).addClass(effect);
      $(input).addClass(style);

      window.setTimeout(function() {
        $(container).removeClass(effect);
        $(input).removeClass(style);

        $(input).focus();

        enableEffect = false;
      }, 2000);
    }
  }

  function connect()
  {
    $('.chat-shadow .content').html('채팅에 참가하고 있습니다.');

    client = new Messaging.Client('localhost', 1884, nickname);
    client.connect({
      'onSuccess' : onSuccessConnection,
      'keepAliveInterval' : 0
    });
    client.onMessageArrived = onMessageArrived;
  }

  function onSuccessConnection()
  {
    $('.chat-shadow').animate({
      'opacity' : 0
    }, 200, function() {
      $(this).hide();

      $('.chat input').focus();
    });

    belong = 'Lobby';
    isPrivate = false;

    client.subscribe(belong);
    client.subscribe('createroom');
    client.subscribe('removeroom');
    client.subscribe('totalrooms');
    client.subscribe('totalusers');
    client.subscribe('online');
    client.subscribe('offline');

    initializeRoom(belong);
  }

  function onMessageArrived(message)
  {
    let json = JSON.parse(message.payloadString);
    let topic = message.destinationName;

    if (topic === 'createroom')
    {
      if (json.nickname != nickname) insertServerMeesage('"' + json.room + '" 채팅방이 생성되었습니다.');
    }
    else if (topic === 'removeroom')
    {
      removeRoom(json.room, false);
    }
    else if (topic === 'online')
    {
      if (json.nickname !== nickname && json.room === belong) insertServerMeesage(json.nickname + '님이 채팅에 참여했습니다.');
    }
    else if (topic === 'offline')
    {
      if (json.nickname !== nickname && json.room === belong)
      {
        insertServerMeesage(json.nickname + '님이 채팅방을 나갔습니다.');

        removeUser(json.nickname);
      }
    }
    else if (topic === 'totalrooms')
    {
      for (let i = 0, length = json.length; i < length; ++i)
      {
        if (json[i]._id && json[i]._id !== '')
        {
          let protect = (json[i].private === undefined) ? false : json[i].private;

          addRoom(json[i]._id, false, protect);
        }
      }
    }
    else if (topic == 'totalusers')
    {
      if (json._id === belong)
      {
        for (let i = 0, length = json.clientIDs.length; i < length; ++i)
        {
          if (json.clientIDs[i] && json.clientIDs[i] !== nickname)
          {
            addUser({
              'nickname' : json.clientIDs[i],
              'clientID' : json.clientIDs[i]
            }, false);
          }
        }
      }
    }
    else
    {
      if (json.type === 'image') insertImage(json.nickname, json.message, true, (json.nickname === nickname));
      else insertMessage(json.nickname, json.message, true, (json.nickname === nickname));
    }
  }

  function initializeRoom(room, protect)
  {
    addRoom(room, false, protect);
    setRoom(room, protect);

    if (room === 'Lobby') insertServerMeesage('즐거운 채팅 되세요!');
    else insertServerMeesage('"' + room + '" 채팅방에서 즐거운 시간 보내세요!');

    $('.chat-users ul').empty();
    addUser({
      'nickname' : nickname,
      'clientID' : nickname
    }, false, true);

    $('.chat-shadow').animate({
      'opacity' : 0
    }, 200, function() {
      $(this).hide();

      $('.chat input').focus();
    });
  }

  function switchRoom(room)
  {
    setRoom(room);

    if (room === 'Lobby') insertServerMeesage('로비로 돌아왔습니다. 채팅방에 참여해 즐거운 채팅을 해보세요!');
    else insertServerMeesage('"' + room + '" 채팅방에서 즐거운 시간 보내세요!');

    $('.chat-users ul').empty();
    addUser({
      'nickname' : nickname,
      'clientID' : nickname
    }, false, true);

    $('.chat-shadow').animate({
      'opacity' : 0
    }, 200, function() {
      $(this).hide();

      $('.chat input').focus();
    });
  }

  $(function() {
    $('.chat-input input').on('keydown', function(event) {
      let keycode = event.which || event.keyCode;

      if (keycode === 13) messageHandler();
    });

    $('.chat-submit button').on('click', function() {
      messageHandler();
    });

    $('.chat-attach input').on('change', function() {
      let files = this.files;
      attachmentHandler(files, function() {
        this.files = undefined;
      });
    });

    $('#nickname-popup .input input').on('keydown', function(event) {
      let keycode = event.which || event.keyCode;

      if (keycode === 13) nicknameHandler();
    });

    $('#nickname-popup .start').on('click', function() {
      nicknameHandler();
    });

    $('#password-popup .input input').on('keydown', function(event) {
      let keycode = event.which || event.keyCode;

      if (keycode === 13) passwordHander();
    });

    $('#password-popup .start').on('click', function() {
      passwordHander();
    });

    $('#room-pop .input input').on('keydown', function(event) {
      let keycode = event.which || event.keyCode;

      if (keycode === 13) createRoom();
    });

    $('.button.create').on('click', function() {
      createRoom();
    });

    $('.button.join').on('click', function() {
      $('#nickname-popup .input input').val('');

      Avgrund.show('#nickname-popup');
      window.setTimeout(function() {
        $('#nickname-popup .input input').focus();
      }, 100);
    });

    $('.chat-rooms .title-button').on('click', function() {
      $('#room-popup .input input').val('');

      Avgrund.show('#room-popup');
      window.setTimeout(function() {
        $('#room-popup .input input').focus();
      }, 100);
    });

    $('.chat-rooms ul').on('scroll', function() {
      $('.chat-rooms ul li.selected').css({
        'top' : $(this).scrollTop()
      });
    });

    $('.chat-messages').on('scroll', function() {
      let self = this;

      window.setTimeout(function() {
        if ($(self).find('ul').height() > $(self).scrollTop() + $(self).height()) $(self).addClass('scroll');
        else $(self).removeClass('scroll');
      }, 50);
    });

    $('.chat-rooms ul li').live('click', function(){
      let room = $(this).attr('data-roomID');
      let protect = $($(this).children('div')[0]).css('display') === 'inline';

      if (room !== belong)
      {
        if (protect)
        {
          $('#password-popup .input input').val('');
          $('#password-popup .room-name').val(room);
          $('#password-popup .popup-title').text('비밀번호를 입력하세요.');

          Avgrund.show('#password-popup');
          window.setTimeout(function() {
            $('#password-popup .input input').focus();
          }, 100);
        }
        else
        {
          client.unsubscribe(belong);
          client.subscribe(room);

          switchRoom(room);
        }
      }
    });
  });

})(jQuery);
