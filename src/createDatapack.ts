import { emptyFolder, writeFiles } from "./fileUtilities.ts";
import { Datapack, execute, NumericDataType, Scoreboard, ScoreAllocator, Namespace, Duration, command, Coordinate, entities, mcfunction, scheduler } from "mcpack-builder";

// output
const outputPath = "pack";
const datapack = new Datapack();

// config
const namespace = new Namespace("3d-grapher");
const internalNamespace = namespace.id("zzz_internal");
const scoreboard = new Scoreboard({ objective: "3d_grapher" });
const entityScoreboardTag = "3dGrapher.marker";
const xSize = 9;
const zSize = 9;
const xSpacing = 0.5;
const zSpacing = 0.5;
const xOrigin = .5 + Math.round(-xSize / 2) * xSpacing;
const zOrigin = .5 + Math.round(-zSize / 2) * zSpacing;
const yOrigin = 36;
const panSpeedX = .04;
const panSpeedZ = .03;
const frameSpeed = .03;

// because scoreboards don't support decimals, 
// we have to represent them by multiplying by this constant.
const resolution = 300;

// helper classes
const scoreAllocator = new ScoreAllocator({ scoreboard });

// target selectors & references
const markers = entities`@e`.hasScoreboardTag(entityScoreboardTag);

const selfX = entities`@s`.nbt.append("Pos[0]");
const selfY = entities`@s`.nbt.append("Pos[1]");
const selfZ = entities`@s`.nbt.append("Pos[2]");
const selfHeadSlot = entities`@s`.nbt.append("ArmorItems[3]");

const panVelocityX = scoreAllocator.score();
const panVelocityZ = scoreAllocator.score();

// public variables
const frame = scoreboard.id("frame");
const panX = scoreboard.id("panX");
const panZ = scoreboard.id("panZ");

datapack.packMeta = {
	pack: {
		pack_format: 7,
		description: "Animated 3D Grapher for Minecraft"
	},
};


datapack.addOnLoadFunction(mcfunction(function*() {
	this.label = "init";
	yield scoreboard.remove();
	yield scoreboard.create();
	yield scoreAllocator.initConstants.run()
	yield panVelocityX.assignConstant(panSpeedX * resolution);
	yield panVelocityZ.assignConstant(panSpeedZ * resolution);
}));


const removeGraph = mcfunction(function*() {
	yield execute().as(markers).run(
		command`kill @s`
	);
})

const flickerOn = mcfunction(function*() {
	this.label = "flickerOn";
	yield execute().as(markers).run(
		selfHeadSlot.assignSNBT(`{ id: "minecraft:cyan_concrete", Count: 1b }`)
	);
});

const flickerOff = mcfunction(function*() {
	this.label = "flickerOff";
	yield execute().as(markers).run(
		selfHeadSlot.assignSNBT(`{ id: "minecraft:cyan_stained_glass", Count: 1b }`)
	);
});

datapack.mcfunctions.set(namespace.id("remove_graph"), removeGraph);

datapack.mcfunctions.set(namespace.id("cleanup"), mcfunction(function*() {
	yield removeGraph.run();
	yield scoreboard.remove();
}));

const resetAnimation = mcfunction(function*() {
	yield panX.assignConstant(-.5 * resolution);
	yield panZ.assignConstant(-.5 * resolution);
	yield frame.assignConstant(0);
})

datapack.mcfunctions.set(namespace.id("reset_animation"), resetAnimation);

datapack.mcfunctions.set(namespace.id("turn_on"), mcfunction(function*() {
	yield removeGraph.run();
	yield resetAnimation.run();

	const y = yOrigin;
	for (let x = 0; x < xSize; x++) {
		for (let z = 0; z < zSize; z++) {
			const coordinate = Coordinate.absolute(xOrigin + x * xSpacing, y, zOrigin + z * zSpacing, true);

			yield command`
				summon minecraft:armor_stand ${coordinate} 
				{Invisible:1b,Marker:1b,NoGravity:1b,Small:1b,Tags:["${entityScoreboardTag}"]}
			`;
		}
	}

	const flickerDurations = [
		[10, 1],
		[10, 1],
		[5, 1],
		[5, 1],
	] as const;

	yield flickerOn.run();
	let time = 0;
	for (const [flickerDuration, flickerInterval] of flickerDurations) {
		yield scheduler.append(Duration.ticks(time += flickerDuration), flickerOff);
		yield scheduler.append(Duration.ticks(time += flickerInterval), flickerOn);
	}

	yield command`execute as @p at @s run playsound minecraft:block.beacon.activate block @s ~ ~ ~ 1 0.7`;
}));

datapack.mcfunctions.set(namespace.id("turn_off"), mcfunction(function*() {
	yield flickerOff.run();
	yield scheduler.append(Duration.ticks(5), removeGraph);
}));



// y = (x^2 + z^2) / 5
datapack.mcfunctions.set(namespace.id("paraboloid"), mcfunction(function*() {
	const coefficient = 1/5;
	const constant = yOrigin;

	yield execute().as(markers).runFunction(mcfunction(function*() {
		this.label = "setParaboloid";
		const xScore = scoreAllocator.score();
		const zScore = scoreAllocator.score();

		yield xScore.assignCommand(selfX.getValue(resolution));
		yield zScore.assignCommand(selfZ.getValue(resolution));
		yield xScore.addScore(panX);
		yield zScore.addScore(panZ);
	
		yield xScore.multiplyScore(xScore);
		yield zScore.multiplyScore(zScore);
	
		yield xScore.addScore(zScore);

		const newResolution = resolution ** 2;
		
		// add constant
		// we need to divide the constant by the coefficient, as we will multiply the whole expression later when assigning to NBT
		// a(...) + C = (... + C/a) * a 
		yield xScore.addScore(scoreAllocator.constant((constant * newResolution) / coefficient));

		// multiply by coefficient, divide by the new resolution
		yield selfY.assignScore(xScore, NumericDataType.Double, 1 * coefficient / newResolution);
	}));
}));


// y = (x^2 - z^2) / 5
datapack.mcfunctions.set(namespace.id("saddle"), mcfunction(function*() {
	// same as paraboloid, but subtract instead of add
	const coefficient = 1/5;
	const constant = yOrigin;

	yield execute().as(markers).runFunction(mcfunction(function*(){
		this.label = "setSaddle";
		const xScore = scoreAllocator.score();
		const zScore = scoreAllocator.score();

		yield xScore.assignCommand(selfX.getValue(resolution));
		yield zScore.assignCommand(selfZ.getValue(resolution));
		yield xScore.addScore(panX);
		yield zScore.addScore(panZ);
	
		yield xScore.multiplyScore(xScore);
		yield zScore.multiplyScore(zScore);
	
		yield xScore.subtractScore(zScore);

		const newResolution = resolution ** 2;
		
		yield xScore.addScore(scoreAllocator.constant((constant * newResolution) / coefficient));

		yield selfY.assignScore(xScore, NumericDataType.Double, 1 * coefficient / newResolution);
	}));
}));

// This function produces a sine-like curve, but is not actually sine.
// It is based on Bhaskara I's sine approximation formula
// Some constants have been changed for reasons I don't remember.
const sineInput = scoreAllocator.score();
const sineOutput = scoreAllocator.score();
const calcSine = mcfunction(function*() {
	this.label = "calcSine";
	// double modX = x % 1;
	// double result = (16 * modX * (1 - modX)) / (5 - modX * (1 - modX));
	// if (x % 2 > 1) result *= -1;
	// return result;

	// x % 1
	const modX = scoreAllocator.score();
	yield modX.assignScore(sineInput);
	yield modX.moduloScore(scoreAllocator.constant(1 * resolution));

	// modX * (1 - modX)
	const modExp = scoreAllocator.score();
	yield modExp.assignConstant(1 * resolution);
	yield modExp.subtractScore(modX);
	yield modExp.multiplyScore(modX); // res = 2

	const denominator = modX; // reuse the score
	yield denominator.assignConstant(5 * resolution ** 2);
	yield denominator.subtractScore(modExp); // res = 2

	yield sineOutput.assignConstant(16 * resolution); // res = 1
	yield sineOutput.multiplyScore(modExp); // res = 3
	yield sineOutput.divideScore(denominator); // res = 1

	// negate if x is even	
	yield sineInput.moduloScore(scoreAllocator.constant(2 * resolution));
	yield execute().if(sineInput.greaterThan(1 * resolution)).run(
		sineOutput.multiplyScore(scoreAllocator.constant(-1))
	);
});

// y = sine(x / 3 + frame) + sine(z / 3 + frame) + altitude;
datapack.mcfunctions.set(namespace.id("sine"), mcfunction(function*() {
	yield execute().as(markers).runFunction(mcfunction(function*() {
		this.label = "setSine";
		// x
		yield sineInput.assignCommand(selfX.getValue(resolution / 3));
		yield sineInput.addConstant(Math.round(-.5 * resolution / 3));
		yield sineInput.addScore(frame);
		yield calcSine.run();
		const temp = scoreAllocator.score();
		yield temp.assignScore(sineOutput);

		// z
		yield sineInput.assignCommand(selfZ.getValue(resolution / 3));
		yield sineInput.addConstant(Math.round(-.5 * resolution / 3));
		yield sineInput.addScore(frame);
		yield calcSine.run();

		yield temp.addScore(sineOutput);
		
		yield temp.addScore(scoreAllocator.constant(yOrigin * resolution));

		yield selfY.assignScore(temp, NumericDataType.Double, 1 / resolution);
	}));
}));

// y = sine((x * x + z * z) / 8 + frame) + altitude;
datapack.mcfunctions.set(namespace.id("ripple"), mcfunction(function*() {
	yield execute().as(markers).runFunction(mcfunction(function*() {
		this.label = "setRipple";
		const xScore = sineInput;
		const zScore = scoreAllocator.score();
		yield xScore.assignCommand(selfX.getValue(resolution));
		yield zScore.assignCommand(selfZ.getValue(resolution));
		yield xScore.addConstant(Math.round(-.5 * resolution));
		yield zScore.addConstant(Math.round(-.5 * resolution));

		yield xScore.multiplyScore(xScore);
		yield zScore.multiplyScore(zScore);

		yield xScore.addScore(zScore); // res = 2

		yield xScore.divideScore(scoreAllocator.constant(8 * resolution)); // res = 1
		yield xScore.addScore(frame);

		yield calcSine.run();

		yield sineOutput.addScore(scoreAllocator.constant(yOrigin * resolution));

		yield selfY.assignScore(sineOutput, NumericDataType.Double, 1 / resolution);
	}));
}));


datapack.mcfunctions.set(namespace.id("animate"), mcfunction(function*() {
	yield execute().if(panX.lessThan(-1.5 * resolution)).run(
		panVelocityX.assignConstant(panSpeedX * resolution)
	);

	yield execute().if(panZ.lessThan(-1.5 * resolution)).run(
		panVelocityZ.assignConstant(panSpeedZ * resolution)
	);

	yield execute().if(panX.greaterThan(1 * resolution)).run(
		panVelocityX.assignConstant(-panSpeedX * resolution)
	);

	yield execute().if(panZ.greaterThan(1 * resolution)).run(
		panVelocityZ.assignConstant(-panSpeedZ * resolution)
	);

	yield panX.addScore(panVelocityX);
	yield panZ.addScore(panVelocityZ);

	yield frame.addScore(scoreAllocator.constant(frameSpeed * resolution));
}));


console.log("Writing files...");
await emptyFolder(outputPath);
await writeFiles(outputPath, datapack.build({
	internalNamespace
}).files);
console.log("Complete!");