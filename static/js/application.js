// user identifier
const allCapsAlpha = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]; 
const allLowerAlpha = [..."abcdefghijklmnopqrstuvwxyz"]; 
const allUniqueChars = [..."~!@#$%^&*()_+-=[]\{}|;:'\",./<>?"];
const allNumbers = [..."0123456789"];

const base = [...allCapsAlpha, ...allNumbers, ...allLowerAlpha, ...allUniqueChars];

const generator = (base, len) => {
   return [...Array(len)]
     .map(i => base[Math.random()*base.length|0])
     .join('');
};

var id = generator(allLowerAlpha, 10);

let game;
let mapArr = Array.from(Array(19), () => new Array(30));

let deathGroup;
let playerGroup;
let players = {};
let walls;
let spikes;

let preview;

let ready = false;

// Support TLS-specific URLs, when appropriate.
if (window.location.protocol == "https:") {
  var ws_scheme = "wss://";
} else {
  var ws_scheme = "ws://"
};

function random(i) {
  return Math.floor(Math.random() * i);
}

var inbox = new ReconnectingWebSocket(ws_scheme + location.host + "/receive");
var outbox = new ReconnectingWebSocket(ws_scheme + location.host + "/submit");

inbox.onmessage = async function(message) {
  if (!ready) {
    return;
  }

  var data = JSON.parse(await message.data.text());
  // console.log("->:" + data.handle);
  if (data.from === id) {
    return;
  }
  // console.log("->:" + data.handle);
  if (data.handle === "player") {
    // console.log("receive player");
    // users[data.from] = {x: data.x, y: data.y, id: data.id}
    if (!players[data.from]) {
      players[data.from] = playerGroup.create(data.x, data.y, 'p' + data.id);
      players[data.from].play('idle'+data.id);
    } else {
      players[data.from].setX(data.x);
      players[data.from].setY(data.y);
    }
  }
  if (data.handle === "death") {
    // console.log("receive death");
    deathGroup.create(data.x, data.y, 'dead');
  }
  if (data.handle === "spike") {
    let obj = spikes.create(calPos(data.x), calPos(data.y), 'spike');
    obj.body.setSize(obj.width, obj.height - 20).setOffset(0, 20);
    mapArr[data.y][data.x] = obj;
  }
  if (data.handle === "wall") {
    mapArr[data.y][data.x] = walls.create(calPos(data.x), calPos(data.y), 'wall');
  }
  if (data.handle === "remove") {
    if (mapArr[data.y][data.x]) {
      mapArr[data.y][data.x].destroy();
    }
  }
  // if (data.handle === "click") {
  //   obj.push(new Circle(data.x, data.y, 10, color(random(255), height, height)));
  // }
};

inbox.onclose = function(){
    console.log('inbox closed');
    this.inbox = new WebSocket(inbox.url);
};

outbox.onclose = function(){
    console.log('outbox closed');
    this.outbox = new WebSocket(outbox.url);
};

// game mode switch
let gamemode = 'play';

// init the engine
window.onload = function() {
  $('#add-wall').on('click', function(eve) {
    preview.setAlpha(1);
    preview.setTexture('wall');
    gamemode = 'add-wall';
    $('#mode').html(gamemode);
  });
  $('#add-spike').on('click', function(eve) {
    preview.setAlpha(1);
    preview.setTexture('spike');
    gamemode = 'add-spike';
    $('#mode').html(gamemode);
  });
  $('#remove').on('click', function(eve) {
    preview.setAlpha(1);
    preview.setTexture('dead');
    gamemode = 'remove';
    $('#mode').html(gamemode);
  });
  $('#playMode').on('click', function(eve) {
    gamemode = 'play';
    preview.setAlpha(0);
    preview.setX(-16);
    preview.setY(-16);
    $('#mode').html(gamemode);
  });
  $('#showDeath').on('click', function(eve) {
    deathGroup.toggleVisible();
  });
  var config = {
    type: Phaser.AUTO,
    width: 960,
    height: 640,
    parent: 'game',
    // scale: {
    //   mode: Phaser.Scale.FIT,
    //   autoCenter: Phaser.Scale.AUTO,
    //   parent: 'game',
    //   width: 960,
    //   height: 640
    // },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 300 }
        }
    },
    dom: {
      createContainer: true
    },
    scene: {
        preload: preload,
        create: create,
        update: update,
    },
  };
  game = new Phaser.Game(config);  
}

function preload()
{
  this.load.setBaseURL('/');

  this.load.image('terminal', 'static/assets/terminal.png');

  this.load.image('dead', 'static/assets/icon/dead.png');
  this.load.image('spike', 'static/assets/spike.png');
  this.load.image('wall', 'static/assets/wall.png');

  this.playerSkin = random(5) + 1;
  this.load.spritesheet('player', 'static/assets/characters/0' + this.playerSkin  + '.png', { frameWidth: 32, frameHeight: 64 });
  this.load.spritesheet('p1', 'static/assets/characters/01.png', { frameWidth: 32, frameHeight: 64 });
  this.load.spritesheet('p2', 'static/assets/characters/02.png', { frameWidth: 32, frameHeight: 64 });
  this.load.spritesheet('p3', 'static/assets/characters/03.png', { frameWidth: 32, frameHeight: 64 });
  this.load.spritesheet('p4', 'static/assets/characters/04.png', { frameWidth: 32, frameHeight: 64 });
  this.load.spritesheet('p5', 'static/assets/characters/05.png', { frameWidth: 32, frameHeight: 64 });

  this.load.spritesheet('bg', 'static/assets/bg.png', { frameWidth: 64, frameHeight: 64 });

  this.load.json('updateMap', 'map');
  this.load.json('death', 'death');

  this.load.image('tiles', 'static/assets/robot.png');
  this.load.tilemapTiledJSON('map', 'static/assets/map.json');
}

function create()
{
  const bgAnimation = this.anims.create({
    key: 'shine',
    frames: this.anims.generateFrameNumbers('bg'),
    frameRate: 2,
    repeat: -1
  });
  const bgScale = 3;
  const bgSize = 64 * bgScale;
  const bgCenter = bgSize / 2;
  for (let j = 0; j * bgSize < 640; j++) {
    for (let i = 0; i * bgSize < 960; i++) {
      let sprite = this.add.sprite(i * bgSize + bgCenter, j * bgSize + bgCenter, 'bg').setScale(bgScale);
      sprite.play('shine');
    }
  }
  
  // map
  const map = this.make.tilemap({ key: 'map' });
  const tileset = map.addTilesetImage('robot', 'tiles');
  const platforms = map.createStaticLayer('map1', tileset, 0, 0);
  platforms.setCollisionByExclusion(-1, true);

  // players
  const playerAnimation = this.anims.create({
    key: 'idle',
    frames: this.anims.generateFrameNumbers('player'),
    frameRate: 2,
    repeat: -1
  });

  for (let i = 1; i < 6; i++) {
    let pAnimation = this.anims.create({
      key: 'idle' + i,
      frames: this.anims.generateFrameNumbers('p' + i),
      frameRate: 2,
      repeat: -1
    });
  }

  this.player = this.physics.add.sprite(48, 576, 'player');
  this.player.setBounce(0.1); // our player will bounce from items
  this.player.setCollideWorldBounds(true); // don't go out of the map
  this.physics.add.collider(this.player, platforms);
  this.player.play('idle');

  // terminal
  this.terminal = this.physics.add.sprite(912,576,'terminal').setImmovable(true);
  this.terminal.body.setAllowGravity(false);
  this.physics.add.collider(this.player, this.terminal, playerWin, null, this);

  // input
  this.cursors = this.input.keyboard.createCursorKeys();
  this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
  this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
  this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
  this.key4 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);

  // add others
  walls = this.physics.add.staticGroup({
    allowGravity: false,
    immovable: true
  });
  this.physics.add.collider(this.player, walls);

  deathGroup = this.add.group({
    createCallback: function(obj) {
      obj.setAlpha(0.01);
    }
  });

  playerGroup = this.add.group({
    createCallback: function(obj) {
      obj.setAlpha(0.3);
    }
  });
  
  // adding spikes
  // this.spikeGroup = this.add.group();
  spikes = this.physics.add.group({
    allowGravity: false,
    immovable: true
  });
  // map.getObjectLayer('spikes').objects.forEach((spike) => {
  //   // Add new spikes to our sprite group
  //   const spikeSprite = this.spikes.create(spike.x, spike.y - spike.height, 'spike').setOrigin(0);
  //   spikeSprite.body.setSize(spike.width, spike.height - 20).setOffset(0, 20);
  //   // this.spikeGroup.add(spikeSprite);
  // });
  this.physics.add.collider(this.player, spikes, playerHit, null, this);

  // add updated map
  currentMap = this.cache.json.get('updateMap');
  for (let i = 0; i < currentMap.length; i++) {
    let x = i % 30;
    let y = Math.floor(i / 30);
    switch (currentMap[i]) {
      case 0:
        break;
      case 1:
        mapArr[y][x] = walls.create(calPos(x), calPos(y), 'wall');
        break;
      case 2:
        let obj = spikes.create(calPos(x), calPos(y), 'spike');
        obj.body.setSize(obj.width, obj.height - 20).setOffset(0, 20);
        mapArr[y][x] = obj;
        break;
    }
  }

  deathList = this.cache.json.get('death');
  for (let i = 0; i < deathList.length; i++) {
    const ele = deathList[i].split(',');
    let x = parseFloat(ele[0]);
    let y = parseFloat(ele[1]);
    deathGroup.create(x, y, 'dead');
  }

  // adding preview
  preview = this.add.sprite(-16,-16,'wall').setInteractive();
  preview.setAlpha(0);
  preview.setDepth(10);
  preview.on('pointerdown', function (pointer) {
    console.log("creata here", pointer.x, pointer.y);
    let x = toLoc(pointer.x);
    let y = toLoc(pointer.y);
    if ((x === 28 && (y === 17 || y === 18)) || (x === 1 && (y === 17 || y === 18)) || y > 18) {
      console.log("not here!");
      return;
    }
    switch (gamemode) {
      case 'add-wall':
        fetch(`/change?x=${x}&y=${y}&t=1`);
        mapArr[y][x] = walls.create(toPos(pointer.x), toPos(pointer.y), 'wall');
        if (outbox.readyState == 1) outbox.send(JSON.stringify({ handle: "wall", from: id, x: x, y: y }));
        break;
      case 'add-spike':
        fetch(`/change?x=${x}&y=${y}&t=2`);
        obj = spikes.create(toPos(pointer.x), toPos(pointer.y), 'spike');
        obj.body.setSize(obj.width, obj.height - 20).setOffset(0, 20);
        mapArr[y][x] = obj;
        if (outbox.readyState == 1) outbox.send(JSON.stringify({ handle: "spike", from: id, x: x, y: y }));
        break;
      case 'remove':
        fetch(`/change?x=${x}&y=${y}&t=0`);
        if (mapArr[y][x]) {
          mapArr[y][x].destroy();
        }
        if (outbox.readyState == 1) outbox.send(JSON.stringify({ handle: "remove", from: id, x: x, y: y }));
    }
    $('#modify').html(function(i, val) {return +val+1;});
  });

  let ptw = this.tweens.add({
    targets: preview,
    alpha: 1,
    duration: 200,
    hold: 500,
    ease: 'Linear',
    repeat: -1,
  });
  
  const proxy = this;
  setInterval(function() {
    if (outbox.readyState == 1 && gamemode === 'play') 
      outbox.send(JSON.stringify({
        handle: 'player', 
        from: id, 
        id: proxy.playerSkin, 
        x: proxy.player.x, 
        y: proxy.player.y 
      }));
  }, 500);

  ready = true;
}

function playerWin(player, terminal) {
  fetch(`/play?win=true&x=${player.x}&y=${player.y}`);
  $('#play').html(function(i, val) {return +val+1;});
  $('#win').html(function(i, val) {return +val+1;});
  $('#winAlert').addClass("show");
  $('#buttons button').prop('disabled', false);
  setTimeout(function() {
    $('#winAlert').removeClass("show");
  }, 3000);
  player.setVelocity(0, 0);

  player.setX(48);
  player.setY(576);

  player.setAlpha(0);
  let tw = this.tweens.add({
    targets: player,
    alpha: 1,
    duration: 100,
    ease: 'Linear',
    repeat: 5,
  });
}

function playerHit(player, spike) {
  // this.spikeGroup.toggleVisible();
  fetch(`/play?x=${player.x}&y=${player.y}`);
  $('#play').html(function(i, val) {return +val+1;});
  $('#loseAlert').addClass("show");
  setTimeout(function() {
    $('#loseAlert').removeClass("show");
  }, 3000);
  player.setVelocity(0, 0);
  if (outbox.readyState == 1) outbox.send(JSON.stringify({ handle: "death", from: id, x: player.x, y: player.y }));

  deathGroup.create(player.x, player.y, 'dead');

  player.setX(48);
  player.setY(576);

  player.setAlpha(0);
  let tw = this.tweens.add({
    targets: player,
    alpha: 1,
    duration: 100,
    ease: 'Linear',
    repeat: 5,
  });
}

function update() {
  if (this.key1.isDown) {
    preview.setAlpha(1);
    preview.setTexture('wall');
    gamemode = 'add-wall';
    $('#mode').html(gamemode);
  }
  if (this.key2.isDown) {
    preview.setAlpha(1);
    preview.setTexture('spike');
    gamemode = 'add-spike';
    $('#mode').html(gamemode);
  }
  if (this.key3.isDown) {
    preview.setAlpha(1);
    preview.setTexture('dead');
    gamemode = 'remove';
    $('#mode').html(gamemode);
  }
  if (this.key4.isDown) {
    gamemode = 'play';
    preview.setAlpha(0);
    preview.setX(-16);
    preview.setY(-16);
    $('#mode').html(gamemode);
  }
  if (gamemode === 'play') {
    // Control the player with left or right keys
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-200);
      // if (this.player.body.onFloor()) {
      //   this.player.play('walk', true);
      // }
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(200);
      // if (this.player.body.onFloor()) {
      //   this.player.play('walk', true);
      // }
    } else {
      // If no keys are pressed, the player keeps still
      this.player.setVelocityX(0);
      // Only show the idle animation if the player is footed
      // If this is not included, the player would look idle while jumping
      // if (this.player.body.onFloor()) {
      //   this.player.play('idle', true);
      // }
    }
  
    // Player can jump while walking any direction by pressing the space bar
    // or the 'UP' arrow
    if ((this.cursors.space.isDown || this.cursors.up.isDown) && this.player.body.onFloor()) {
      this.player.setVelocityY(-225);
      // this.player.play('jump', true);
    }
  
    // If the player is moving to the right, keep them facing forward
    if (this.player.body.velocity.x > 0) {
      this.player.setFlipX(false);
    } else if (this.player.body.velocity.x < 0) {
      // otherwise, make them face the other side
      this.player.setFlipX(true);
    }
  } else {
    // console.log(this.input.x,this.input.y)
    let y = toPos(this.input.y);
    let x = toPos(this.input.x);
    preview.setX(x);
    preview.setY(y);
  }
}


function toLoc(x) {
  return Math.floor(x / 32);
}

function calPos(x) {
  return x * 32 + 16;
}

function toPos(x) {
  return calPos(toLoc(x));
}