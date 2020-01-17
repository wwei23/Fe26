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
						 "8Beryllium":"12Carbon",
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
						 "44Calcium":"48Ti,
						 "48Titanium":"52Cr",
						 "52Chromium":"56Iron",
						 "56Iron":"60Ni"
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
	var d=274.448763451;//Derivative of this function at 8, because f(9) is over 50000, and I think that's far too long.
	var f8=Math.exp(Math.pow((-b+Math.sqrt(b*b+4*a*(c+8)))/(2*a),25));
	if(x<=8){
		return Math.exp(Math.pow((-b+Math.sqrt(b*b+4*a*(c+x)))/(2*a),25));
	}else{
		return f8+d*(x-8);//Inverse:
				  //x=(m-f8)/d+8
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
  }
}};
