function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  this.version = 0.8;

  this.storageManager.clearIfOutdated(this.version);

  this.startTiles     = 2;
  this.winningValue = "56Iron";

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
	return this;
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  if (this.over || (this.won && !this.keepPlaying)) {
    return true;
  } else {
    return false;
  }
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? "Hydrogen" : "Deuteron";
	  var tile;
    if(this.labels[value] || false){
     tile = new Tile(this.grid.randomAvailableCell(), value, this.labels[value]);
  }else{
	  tile = new Tile(this.grid.randomAvailableCell(), value, this.getLabel(value));
  }

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        var shouldMove = true;
        if (next && !next.mergedFrom) {
          //if(next.value === tile.value) {
          if( self.canFuse(next.value,tile.value) ) {
            shouldMove = false;
            var fusionValue = self.fusion(next.value,tile.value);
		  var merged;
		  if(self.labels[fusionValue] || false){
            		merged=new Tile(positions.next, fusionValue, self.labels[fusionValue]);
		  }else{
            		merged=new Tile(positions.next, fusionValue, self.getLabel(fusionValue));
		  }
            merged.mergedFrom = [tile, next];

            var decay = self.decay()[fusionValue] || false;
	    var multipler=decay['multipler'];
	    multipler=Math.log(multipler)/Math.log(10);
	    multipler=self.getMultipler(multipler);
            if(decay !== false) {
              merged.movesLeft = Math.floor(Math.random() * (Math.ceil(8*multipler) - Math.ceil(4*multipler) + 1)) + Math.ceil(4*multipler);
            }

            self.grid.insertTile(merged);
            self.grid.removeTile(tile);

            // Converge the two tiles' positions
            tile.updatePosition(positions.next);

            // Update the score
	    if(self.pointValues[merged.value] || false){
            	self.score += self.pointValues[merged.value];
	    }else{
		    self.score+=self.getPoints(merged.value)/2;
	    }

            // TODO win state ( if not decaying )
            if (merged.value === self.winningValue) self.won = true;
          }
        }
        if (shouldMove) {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    this.grid.eachCell(function(x, y, tile) {
      if(tile !== null && self.decay()[tile.value] && tile.decay()) {
        var decayValue = self.decay()[tile.value]['to'];
	var decayed = new Tile({
          x: tile.x,
          y: tile.y
        }, decayValue, self.labels[decayValue]);
	      if(self.labels[decayValue] || false){
        decayed = new Tile({
          x: tile.x,
          y: tile.y
        }, decayValue, self.labels[decayValue]);
	      }else{
        decayed = new Tile({
          x: tile.x,
          y: tile.y
        }, decayValue, self.getLabel(decayValue));
	      }
	var decay = self.decay()[decayValue] || false;
	var multipler=decay['multipler'];
	multipler=Math.log(multipler)/Math.log(10);
	multipler=self.getMultipler(multipler);
        if(decay !== false) {
          decayed.movesLeft = Math.floor(Math.random() * (Math.ceil(8*multipler) - Math.ceil(4*multipler) + 1)) + Math.ceil(4*multipler);
        }//8B -> 8Be
        self.grid.removeTile(tile);
        self.grid.insertTile(decayed);
	if(self.decay()[tile.value].points || false){
          self.score += self.decay()[tile.value].points;
	}

        if (decayed.value === self.winningValue) self.won = true;
      }
    });

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && self.canFuse(other.value, tile.value)) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};

GameManager.prototype.canFuse = function (first, second) {
  return (this.fusionRules()[first]  && this.fusionRules()[first][second]) ||
         (this.fusionRules()[second] && this.fusionRules()[second][first]);
};

GameManager.prototype.fusion = function (first, second) {
  var forward = this.fusionRules()[first];
  if (forward && forward[second]) {
    return forward[second];
  } else {
    var backward = this.fusionRules()[second][first];
    return backward;
  }
};

// a:{b:c}
// a + b = c
GameManager.prototype.fusionRules =function(){ return {
  "Hydrogen":{"Hydrogen":"Deuteron",
							"Deuteron":"3Helium",
	      						"7Li":"4Helium"
						 },
  "3Helium":{"3Helium":"4Helium",
							"4Helium":"7Beryllium"
						},
  "4Helium":{"4Helium":"8Beryllium", // unstable decays into 2 4heliums
						 "8Beryllium":"12Carbon",//A/A
						 "12Carbon":"16Oxygen",
						 "16Oxygen":"20Neon",
						 "20Neon":"24Magnesium", // this is a killer!
						 "24Magnesium":"28Silicon", //Nah I don't feel like it
						 "28Silicon":"32Sulfur",
						 "32Sulfur":"36Argon",
						 "36Argon":"40Calcium",
						 "40Calcium":"44Titanium",
						 "44Titanium":"48Chromium",
						 "48Chromium":"52Iron",
						 "52Iron":"56Nickel",
						 "56Nickel":"60Zn",
						 "60Zn":"64Ge",
						 "64Ge":"68Se",
						 "68Se":"72Kr",
						 "72Kr":"76Sr",
						 "76Sr":"80Zr",
						 "80Zr":"84Mo",
						 "84Mo":"88Ru",
						 "88Ru":"92Pd",
						 "92Pd":"96Cd",
						 "96Cd":"100Sn",
						 "100Sn":"104Te",//"This game is too easy!"
						 "104Te":"108Xe",//Then here's a challenge for you: get this isotope, 108Xe.
						 "44Ca":"48Ti",//A/A+4
						 "48Ti":"52Cr",
						 "52Cr":"56Iron",
						 "56Iron":"60Ni",
						 "60Ni":"64Zn",
						 "64Zn":"68Ge",
						 "68Ge":"72Se",
						 "72Se":"76Kr",
						 "76Kr":"80Sr",
						 "80Sr":"84Zr",
						 "84Zr":"88Mo",
						 "88Mo":"92Ru",
						 "92Ru":"96Pd",
						 "96Pd":"100Cd",
						 "100Cd":"104Sn",
						 "104Sn":"108Te",
						 "108Te":"112Xe",
						 "112Xe":"116Ba",
						 "116Ba":"120Ce",
						 "68Zn":"72Ge",//A/A+8
						 "72Ge":"76Se",
						 "76Se":"80Kr",
						 "80Kr":"84Sr",
						 "84Sr":"88Zr",
						 "88Zr":"92Mo",
						 "92Mo":"96Ru",
						 "96Ru":"100Pd",
						 "100Pd":"104Cd",
						 "104Cd":"108Sn",
						 "108Sn":"112Te",
						 "112Te":"116Xe",
						 "116Xe":"120Ba",
						 "120Ba":"124Ce",
						 "124Ce":"128Nd",
						 "128Nd":"132Sm",
						 "132Sm":"136Gd",
						 "136Gd":"140Dy",
						 "88Sr":"92Zr",//A/A+12
						 "92Zr":"96Mo",
						 "96Mo":"100Ru",
						 "100Ru":"104Pd",
						 "104Pd":"108Cd",
						 "108Cd":"112Sn",
						 "112Sn":"116Te",
						 "116Te":"120Xe",
						 "120Xe":"124Ba",
						 "124Ba":"128Ce",
						 "128Ce":"132Nd",
						 "132Nd":"136Sm",
						 "136Sm":"140Gd",
						 "116Sn":"120Te",//A/A+16
						 "120Te":"124Xe",
						 "124Xe":"128Ba",
						 "128Ba":"132Ce",
						 "132Ce":"136Nd",
						 "136Nd":"140Sm",
						 "124Te":"128Xe",//A/A+20
						 "128Xe":"132Ba",
						 "132Ba":"136Ce",
						 "136Ce":"140Nd",
	     					 //Reactions off the alpha web
						 "95Mo":"99Ru",
						 "94Mo":"98Ru",
						 "107Ag":"111Cd",
						 "111Cd":"115Sn",
						 "115Sn":"119Sb",
						 "127I":"131Xe",
						 "131Xe":"135Ba",
						 "135Ba":"139Ce"
						},
    "7Beryllium":{"Hydrogen":"8B"
             },
  "12Carbon":{"12Carbon":["20Neon","23Na","23Mg","24Magnesium","16Oxygen"][Math.floor(5*Math.random())], // + 4Helium (randomness)
						 },
  "16Oxygen":{"16Oxygen":["28Silicon","31P","31S","30Si","30P","32Sulfur","24Magnesium"][Math.floor(7*Math.random())], // + 4Helium
             },
  "23Na":{"Hydrogen":"24Magnesium"
             },
  "30Si":{"Hydrogen":"31P"
             },
  "31P":{"Hydrogen":"32Sulfur"
             }
}};

GameManager.prototype.labels = {
  "Hydrogen": "Hydrogen",
  "Deuteron": "Deuteron",
  "3Helium": "<sup>3</sup>Helium",
  "4Helium": "<sup>4</sup>Helium",
  "7Beryllium": "<sup>7</sup>Beryllium",
  "8Beryllium": "<sup>8</sup>Beryllium",
  "12Carbon": "<sup>12</sup>Carbon",
  "16Oxygen": "<sup>16</sup>Oxygen",
  "20Neon": "<sup>20</sup>Neon",
  "24Magnesium": "<sup>24</sup>Magnesium",
  "28Silicon": "<sup>28</sup>Silicon",
  "32Sulfur": "<sup>32</sup>Sulfur",
  "36Argon": "<sup>36</sup>Argon",
  "40Calcium": "<sup>40</sup>Calcium",
  "44Titanium": "<sup>44</sup>Titanium",
  "48Chromium": "<sup>48</sup>Chromium",
  "52Iron": "<sup>52</sup>Iron",
  "56Nickel": "<sup>56</sup>Nickel",
  "56Iron": "<sup>56</sup>Iron"
};
GameManager.prototype.getLabel=function(nuclide){
	var x=nuclide.length;
	while((1*nuclide.slice(0,x)+"")==="NaN"){
		x-=1;
	}
	if(nuclide[x]==="m"){//Handle isomers
		x+=1;
	}
	var y=nuclide.length-x;
	return "<sup>"+nuclide.slice(0,x)+"</sup>"+nuclide.slice(-y);
};
GameManager.prototype.getPoints=function(nuclide){
	var x=nuclide.length;
	while((1*nuclide.slice(0,x)+"")==="NaN"){
		x-=1;
	}
	return 1*nuclide.slice(0,x);
};
GameManager.prototype.pointValues = {
  "Deuteron":1,
  "3Helium":1.5,
  "4Helium":2,
  "7Beryllium":3,
  "8Beryllium":4,
  "12Carbon":6,
  "16Oxygen":8,
  "20Neon":10,
  "24Magnesium":12,
  "28Silicon":14,
  "32Sulfur":16,
  "36Argon":18,
  "40Calcium":20,
  "44Titanium":22,
  "48Chromium":24,
  "52Iron":26,
  "56Nickel":28,
  "56Iron":56
};
GameManager.prototype.getMultipler=function(x){
	//Inverse:
	//x=-c+b*ln(m)^(1/25)+a*ln(m)^(2/25)
	//x is ln(half-life in seconds)
	//y is multipler
	//This function has been tailored to fit the original multiplers of 7Be, 8Be, and 56Ni.
	var a=1.40957;
	var b=21.249;
	var c=16.0867;
	var d=7.47733608077;//Derivative of this function at 8, because f(9) is over 50000, and I think that's far too long. f(8) is too far because then 44Ti takes over 2000 moves to decay.
	var f7=Math.exp(Math.pow((-b+Math.sqrt(b*b+4*a*(c+7)))/(2*a),25));
	if(x<=7){
		return Math.exp(Math.pow((-b+Math.sqrt(b*b+4*a*(c+x)))/(2*a),25));
	}else{
		return f7+d*(x-7);//Inverse:
				  //x=(m-f7)/d+7
	}
};
GameManager.prototype.decay =function(){return {
  "7Beryllium": {
    "multipler": 53.22*86400,
    "to": "7Li",
		"points": -3
  },
  "8Beryllium": {
    "multipler": 8.19*Math.pow(10,-17),
    "to": "4Helium",
		"points": -4
  },
  "8B":{
    "multipler":0.77,
    "to":"8Beryllium"
  },
  "23Mg":{
    "multipler":11.317,
    "to":"23Na"
  },
  "30P":{
    "multipler":2.498*60,
    "to":"30Si"
  },
  "31S":{
    "multipler":2.5534,
    "to":"31P"
  },
  "44Sc":{
    "multipler":3.97*3600,
    "to":"44Ca"
  },
  "44Titanium":{
    "multipler":60*365.2425*86400,
    "to":"44Sc"
  },
  "48V":{
    "multipler":15.9735*86400,
    "to":"48Ti"
  },
  "48Chromium":{
    "multipler":21.56*3600,
    "to":"48V"
  },
  "52Mn":{
    "multipler":5.591*86400,
    "to":"52Cr"
  },
  "52mMn":{
    "multipler":21.1*60,
    "to":["52Cr","52Mn"][Math.floor(2*Math.random())]
  },
  "52Iron":{
    "multipler":8.275*3600,
    "to":"52mMn"//Yes isomers :P
  },
  "56Co": {
    "multipler": 77.27*86400,
    "to": "56Iron",
		"points": 28
  },
  "56Nickel": {
    "multipler": 6.075*86400,
    "to": "56Co",
		"points": 28
  },
  "60Cu": {
    "multipler": 23.7*60,
    "to": "60Ni"
  },
  "60Zn": {
    "multipler": 2.38*60,
    "to": "60Cu"
  },
  "64Ga": {
    "multipler": 2.627*60,
    "to": "64Zn"
  },
  "68Ga": {
    "multipler": 67.71*60,
    "to": "68Zn"
  },
  "64Ge": {
    "multipler": 63.7,
    "to": "64Ga"
  },
  "68Ge": {
    "multipler": 270.95*86400,
    "to": "68Ga"
  },
  "68As": {
    "multipler": 151.6,
    "to": "68Ge"
  },
  "72As": {
    "multipler": 26*3600,
    "to": "72Ge"
  },
  "68Se": {
    "multipler": 35.5,
    "to": "68As"
  },
  "72Se": {
    "multipler": 8.4*86400,
    "to": "72As"
  },
  "72Br": {
    "multipler": 78.6,
    "to": "72Se"
  },
  "76Br": {
    "multipler": 16.2*86400,
    "to": "76Se"
  },
  "72Kr": {
    "multipler": 17.15,
    "to": "72Br"
  },
  "76Kr": {
    "multipler": 14.8*3600,
    "to": "76Br"
  },
  "76Rb": {
    "multipler": 36.5,
    "to": ["72Se","76Kr"][Math.floor(2*Math.random())]
  },
  "80Rb": {
    "multipler": 33.4,
    "to": "80Kr"
  },
  "83Rb": {
    "multipler": 86.2*86400,
    "to": "83Kr"//A final decay product, no fusion or fission after this
  },
  "76Sr": {
    "multipler": 7.89,
    "to": "76Rb"
  },
  "80Sr": {
    "multipler": 106.3*60,
    "to": "80Rb"
  },
  "83Sr": {
    "multipler": 32.41*3600,
    "to": "83Rb"
  },
  "80Y": {
    "multipler": 30.1,
    "to": "80Sr"
  },
  "83Y": {
    "multipler": 7.8*60,
    "to": "83Sr"
  },
  "84Y": {
    "multipler": 39.5*60,
    "to": "84Sr"
  },
  "88Y": {
    "multipler": 106.616*86400,
    "to": "88Sr"
  },
  "80Zr": {
    "multipler": 4.6,
    "to": "80Y"
  },
  "84Zr": {
    "multipler": 25.9*60,
    "to": "84Y"
  },
  "88Zr": {
    "multipler": 83.4*86400,
    "to": "88Y"
  },
  "84Nb": {
    "multipler": 9.8,
    "to": ["83Y","84Zr"][Math.floor(2*Math.random())]
  },
  "88Nb": {
    "multipler": 14.55*60,
    "to": "88Zr"
  },
  "84Mo": {
    "multipler": 0.0038,
    "to": "84Nb"
  },
  "88Mo": {
    "multipler": 8*60,
    "to": "88Nb"
  },
  "93Mo": {
    "multipler": 4000*365.2425*86400,
    "to": "93Nb"//Final decay product?
  },
  "88Tc": {
    "multipler": 5.8,
    "to": "88Mo"
  },
  "92Tc": {
    "multipler": 4.25*60,
    "to": "92Mo"
  },
  "93Tc": {
    "multipler": 2.75*3600,
    "to": "93Mo"
  },
  "94Tc": {
    "multipler": 293*60,
    "to": "94Mo"
  },
  "95Tc": {
    "multipler": 20*3600,
    "to": "95Mo"
  },
  "88Ru": {
    "multipler": 1.3,
    "to": "88Tc"
  },
  "92Ru": {
    "multipler": 3.65*60,
    "to": "92Tc"
  },
  "94Ru": {
    "multipler": 51.8*60,
    "to": "94Tc"
  },
  "95Ru": {
    "multipler": 1.643*3600,
    "to": "95Tc"
  },
  "92Rh": {
    "multipler": 4.3,
    "to": "92Ru"
  },
  "94Rh": {
    "multipler": 70.6,
    "to": ["93Tc","94Ru"][Math.floor(2*Math.random())]
  },
  "95Rh": {
    "multipler": 5.02*60,
    "to": "95Ru"
  },
  "96Rh": {
    "multipler": 9.9*60,
    "to": "96Ru"
  },
  "98Rh": {
    "multipler": 8.72*60,
    "to": "98Ru"
  },
  "99Rh": {
    "multipler": 16.1*86400,
    "to": "99Ru"
  },
  "100Rh": {
    "multipler": 20.8*3600,
    "to": "100Ru"
  },
  "92Pd": {
    "multipler": 1.1,
    "to": "92Rh"
  },
  "92Pd": {
    "multipler": 1.1,
    "to": "92Rh"
  },
  "96Pd": {
    "multipler": 122,
    "to": "96Rh"
  },
  "98Pd": {
    "multipler": 17.7*60,
    "to": "98Rh"
  },
  "99Pd": {
    "multipler": 21.4*60,
    "to": "99Rh"
  },
  "100Pd": {
    "multipler": 3.63*86400,
    "to": "100Rh"
  },
  "96Ag": {
    "multipler": 4.45,
    "to": ["95Rh","96Pd"][Math.floor(2*Math.random())]
  },
  "99Ag": {
    "multipler": 124,
    "to": "99Pd"
  },
  "100Ag": {
    "multipler": 2.01*60,
    "to": "100Pd"
  },
  "104Ag": {
    "multipler": 69.2*60,
    "to": "104Pd"
  },
  "107mAg": {
    "multipler": 44.3,
    "to": "107Ag"
  },
  "96Cd": {
    "multipler": 1,
    "to": "96Ag"
  },
  "99Cd": {
    "multipler": 16,
    "to": ["94Rh","98Pd","99Ag"][Math.floor(3*Math.random())]
  },
  "100Cd": {
    "multipler": 49.1,
    "to": "100Ag"
  },
  "104Cd": {
    "multipler": 57.7*60,
    "to": "104Ag"
  },
  "107Cd": {
    "multipler": 6.5*3600,
    "to": "107mAg"
  },
  "100In": {
    "multipler": 5.9,
    "to": ["99Ag","100Cd"][Math.floor(2*Math.random())]
  },
  "104In": {
    "multipler": 1.8*60,
    "to": "104Cd"
  },
  "107In": {
    "multipler": 32.4*60,
    "to": "107Cd"
  },
  "108In": {
    "multipler": 58*60,
    "to": "108Cd"
  },
  "111In": {
    "multipler": 2.8047*86400,
    "to": "111Cd"
  },
  "100Sn": {
    "multipler": 1.1,
    "to": ["99Cd","100In"][Math.floor(2*Math.random())]
  },
  "104Sn": {
    "multipler": 20.8,
    "to": "104In"
  },
  "107Sn": {
    "multipler": 2.9*60,
    "to": "107In"
  },
  "108Sn": {
    "multipler": 10.3*60,
    "to": "108In"
  },
  "111Sn": {
    "multipler": 35.3*60,
    "to": "111In"
  },
  "108Sb": {
    "multipler": 7.4,
    "to": ["107In","108Sn"][Math.floor(2*Math.random())]
  },
  "111Sb": {
    "multipler": 75,
    "to": "111Sn"
  },
  "112Sb": {
    "multipler": 51.4,
    "to": "112Sn"
  },
  "114Sb": {
    "multipler": 3.49*60,
    "to": "114Sn"
  },
  "115Sb": {
    "multipler": 32.1*60,
    "to": "115Sn"
  },
  "116Sb": {
    "multipler": 15.8*60,
    "to": "116Sn"
  },
  "119Sb": {
    "multipler": 38.19*3600,
    "to": "119Sn"
  },
  "104Te": {
    "multipler": 18*Math.pow(10,-9),
    "to": "100Sn"
  },
  "108Te": {
    "multipler": 2.1,
    "to": ["104Sn","104In","107Sn","108Sb"][Math.floor(4*Math.random())]//Can these things please just decay normally and not off-web? X_X
  },
  "112Te": {
    "multipler": 2*60,
    "to": "112Sb"
  },
  "114Te": {
    "multipler": 15.2*60,
    "to": "114Sb"
  },
  "115Te": {
    "multipler": 5.8*60,
    "to": "115Sb"
  },
  "116Te": {
    "multipler": 2.48*3600,
    "to": "116Sb"
  },
  "119Te": {
    "multipler": 16.05*3600,
    "to": "119Sb"
  },
  "112I": {
    "multipler": 3.42,
    "to": ["108Sn","108Sb","111Sb","112Te"][Math.floor(4*Math.random())]//-_-
  },
  "115I": {
    "multipler": 1.3*60,
    "to": "115Te"
  },
  "116I": {
    "multipler": 2.91,
    "to": "116Te"
  },
  "119I": {
    "multipler": 19.1*60,
    "to": "119Te"
  },
  "120I": {
    "multipler": 81.6*60,
    "to": "120Te"
  },
  "108Xe": {
    "multipler": 58*Math.pow(10,-6),
    "to": "104Te"
  },
  "112Xe": {
    "multipler": 0.74,
    "to": ["108Te","112I"][Math.floor(2*Math.random())]//At least not off-grid
  },
  "115Xe": {
    "multipler": 18,
    "to": ["111Sb","114Te","115I"][Math.floor(3*Math.random())]
  },
  "116Xe": {
    "multipler": 59,
    "to": "116I"
  },
  "119Xe": {
    "multipler": 5.8*60,
    "to": "119I"
  },
  "120Xe": {
    "multipler": 40*60,
    "to": "120I"
  },
  "124Xe": {
    "multipler": 1.8*365.2425*86400*Math.pow(10,22),//Good luck getting 124Te lol
    "to": "124Te"
  },
  "127Xe": {
    "multipler": 36.345*86400,
    "to": "127I"
  },
  "116Cs": {
    "multipler": 0.7,
    "to": ["112Te","115I","116Xe"][Math.floor(3*Math.random())]
  },
  "119Cs": {
    "multipler": 43,
    "to": ["115Te","119Xe"][Math.floor(2*Math.random())]
  },
  "120Cs": {
    "multipler": 61.2,
    "to": ["116Te","119I","120Xe"][Math.floor(3*Math.random())]//Why so many random decays though
  },
  "124Cs": {
    "multipler": 30.9,
    "to": "124Xe"
  },
  "127Cs": {
    "multipler": 6.25*3600,
    "to": "127Xe"
  },
  "128Cs": {
    "multipler": 3.64*60,
    "to": "128Xe"
  },
  "131Cs": {
    "multipler": 9.689*86400,
    "to": "131Xe"
  },
  "116Ba": {
    "multipler": 1.3,
    "to": ["115Xe","116Cs"][Math.floor(2*Math.random())]
  },
  "120Ba": {
    "multipler": 24,
    "to": "120Cs"
  },
  "124Ba": {
    "multipler": 11*60,
    "to": "124Cs"
  },
  "127Ba": {
    "multipler": 12.7*60,
    "to": "127Cs"
  },
  "128Ba": {
    "multipler": 2.43*86400,
    "to": "128Cs"
  },
  "130Ba": {
    "multipler": 1.6*365.2425*86400*Math.pow(10,21),//Good luck getting 130Xe lol
    "to": "130Xe"
  },
  "131Ba": {
    "multipler": 11.5*86400,
    "to": "131Cs"
  },
  "120La": {
    "multipler": 2.8,
    "to": ["119Cs","120Ba"][Math.floor(2*Math.random())]
  },
  "124La": {
    "multipler": 29.21,
    "to": "124Ba"
  },
  "127La": {
    "multipler": 5.1*60,
    "to": "127Ba"
  },
  "128La": {
    "multipler": 5.18*60,
    "to": "128Ba"
  },
  "130La": {
    "multipler": 8.7*60,
    "to": "130Ba"
  },
  "131La": {
    "multipler": 59*60,
    "to": "131Ba"
  },
  "132La": {
    "multipler": 4.8*3600,
    "to": "132Ba"
  },
  "135La": {
    "multipler": 11.7*3600,
    "to": "135Ba"
  },
  "120Ce": {
    "multipler": 0.25,
    "to": "120La"
  },
  "124Ce": {
    "multipler": 9.1,
    "to": "124La"
  },
  "127Ce": {
    "multipler": 29,
    "to": "127La"
  },
  "128Ce": {
    "multipler": 3.93*60,
    "to": "128La"
  },
  "131Ce": {
    "multipler": 10.2*60,
    "to": "131La"
  },
  "132Ce": {
    "multipler": 3.51*3600,
    "to": "132La"
  },
  "135Ce": {
    "multipler": 17.7*3600,
    "to": "135La"
  },
  "139Ce": {
    "multipler": 137.641*86400,
    "to": "139La"
  },
  "128Pr": {
    "multipler": 2.84,
    "to": ["127La","128Ce"][Math.floor(2*Math.random())]
  },
  "131Pr": {
    "multipler": 1.5*60,
    "to": "131Ce"
  },
  "132Pr": {
    "multipler": 1.49*60,
    "to": "132Ce"
  },
  "135Pr": {
    "multipler": 24*60,
    "to": "135Ce"
  },
  "136Pr": {
    "multipler": 50.65*60,
    "to": "136Ce"
  },
  "139Pr": {
    "multipler": 4.41*3600,
    "to": "139Ce"
  },
  "140Pr": {
    "multipler": 3.39*60,
    "to": "140Ce"
  },
  "128Nd": {
    "multipler": 4.9,
    "to": ["127Ce","128Pr"][Math.floor(2*Math.random())]
  },
  "131Nd": {
    "multipler": 33,
    "to": ["130Ce","131Pr"][Math.floor(2*Math.random())]
  },
  "132Nd": {
    "multipler": 1.56*60,
    "to": "132Pr"
  },
  "135Nd": {
    "multipler": 12.4*60,
    "to": "135Pr"
  },
  "136Nd": {
    "multipler": 50.65*60,
    "to": "136Pr"
  },
  "139Nd": {
    "multipler": 29.7*60,
    "to": "139Pr"
  },
  "140Nd": {
    "multipler": 3.37*86400,
    "to": "140Pr"
  },
  "132Pm": {
    "multipler": 6.2,
    "to": ["131Pr","132Nd"][Math.floor(2*Math.random())]
  },
  "135Pm": {
    "multipler": 49,
    "to": "135Nd"
  },
  "136Pm": {
    "multipler": 107,
    "to": "136Nd"
  },
  "139Pm": {
    "multipler": 4.15*60,
    "to": "139Nd"
  },
  "140Pm": {
    "multipler": 9.2,
    "to": "140Nd"
  },
  "132Sm": {
    "multipler": 4,
    "to": ["131Nd","132Pm"][Math.floor(2*Math.random())]
  },
  "136Sm": {
    "multipler": 47,
    "to": "136Pm"
  },
  "139Sm": {
    "multipler": 2.57*60,
    "to": "139Pm"
  },
  "140Sm": {
    "multipler": 14.82*60,
    "to": "140Pm"
  },
  "136Eu": {
    "multipler": 3.3,
    "to": ["135Pm","136Sm"][Math.floor(2*Math.random())]
  },
  "139Eu": {
    "multipler": 17.9,
    "to": "139Sm"
  },
  "140Eu": {
    "multipler": 1.51,
    "to": "140Sm"
  },
  "136Gd": {
    "multipler": 1,
    "to": "136Eu"
  },
  "140Gd": {
    "multipler": 15.8,
    "to": "140Eu"
  },
  "140Tb": {
    "multipler": 2.4,
    "to": ["139Eu","140Gd"][Math.floor(2*Math.random())]
  },
  "140Dy": {
    "multipler": 0.7,
    "to": "140Tb"
  }
}};
