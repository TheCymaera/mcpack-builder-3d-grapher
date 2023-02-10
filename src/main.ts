import { writeFiles } from "./fileUtilities.ts";
import { Datapack, EntitySelector, CustomCommand, Execute, NumericDataType, Scoreboard, NBTReference, ScoreAllocator, Namespace, Tag, Duration, ScheduleMode } from "npm:mcpack-builder@1.0.1";

// output
const outputPath = "pack";
const datapack = new Datapack();

// config
const namespace = new Namespace("3d-grapher");
const internalId = namespace.getID("internal");
const scoreboard = new Scoreboard({ objective: "3d_grapher" });
const xSize = 10;
const zSize = 10;
const xSpacing = 0.5;
const zSpacing = 0.5;
const xOrigin = (-xSize / 2) * xSpacing;
const zOrigin = (-zSize / 2) * zSpacing;
const yOrigin = 20;
const panSpeedX = .04;
const panSpeedZ = .03;
const frameSpeed = .03;

// because scoreboards don't support decimals, 
// we have to represent them by multiplying by this constant.
const resolution = 100;

// a helper class that makes it easier to create scores
const scoreAllocator = new ScoreAllocator({ scoreboard });

// target selectors & references
const allMarkers = EntitySelector.allEntities().hasScoreboardTag("3dGrapher.marker");
const selfX = new NBTReference({ target: EntitySelector.self(), path: "Pos[0]" });
const selfY = new NBTReference({ target: EntitySelector.self(), path: "Pos[1]" });
const selfZ = new NBTReference({ target: EntitySelector.self(), path: "Pos[2]" });
const selfHeadSlot = new NBTReference({ target: EntitySelector.self(), path: "ArmorItems[3]" });
const panVelocityX = scoreAllocator.score();
const panVelocityZ = scoreAllocator.score();

// public variables
const frame = scoreboard.custom("frame");
const panX = scoreboard.custom("panX");
const panZ = scoreboard.custom("panZ");

datapack.setPackMeta({
	pack: {
		pack_format: 7,
		description: "Animated 3D Grapher for Minecraft"
	},
});

const init = datapack.setFunction(internalId.getID("init"), function*() {
	yield scoreboard.remove();
	yield scoreboard.create();
	yield scoreAllocator.initConstants;
	yield panVelocityX.assignConstant(panSpeedX * resolution);
	yield panVelocityZ.assignConstant(panSpeedZ * resolution);
});

const removeGraph = datapack.setFunction(namespace.getID("remove_graph"), function*() {
	yield new Execute().as(allMarkers).run(
		CustomCommand.single("kill @s")
	);
});

datapack.setFunction(namespace.getID("cleanup"), function*() {
	yield removeGraph.run();
	yield scoreboard.remove();
});

datapack.onLoadFunctions = new Tag([
	init.namespacedId,
]);

datapack.setFunction(namespace.getID("create_graph"), function*() {
	yield removeGraph.run();

	const y = yOrigin;
	for (let x = 0; x < xSize; x++) {
		for (let z = 0; z < zSize; z++) {
			// summon coordinates default to .5, so we have to explicitly specify .0.
			const finalX = (xOrigin + x * xSpacing).toFixed(1);
			const finalY = y;
			const finalZ = (zOrigin + z * zSpacing).toFixed(1);

			yield CustomCommand.single(
				`summon minecraft:armor_stand ${finalX} ${finalY} ${finalZ} {Invisible:1b,Marker:1b,NoGravity:1b,Small:1b,Tags:["3dGrapher.marker"]}`
			);
		}
	}

	const flickerOn = datapack.setFunction(internalId.getID("flicker-on"), function*() {
		yield new Execute().as(allMarkers).run(
			selfHeadSlot.setLiteralValue(`{ id: "minecraft:cyan_concrete", Count: 1b }`)
		);
	});
	
	const flickerOff = datapack.setFunction(internalId.getID("flicker-off"), function*() {
		yield new Execute().as(allMarkers).run(
			selfHeadSlot.setLiteralValue(`{ id: "minecraft:cyan_stained_glass", Count: 1b }`)
		);
	});

	const flickerDurations = [
		[10, 1],
		[10, 1],
		[5, 1],
		[5, 1],
	] as const;

	yield flickerOn.run();
	let time = 0;
	for (const [flickerDuration, flickerInterval] of flickerDurations) {
		yield flickerOff.schedule(Duration.ticks(time += flickerDuration), ScheduleMode.Append);
		yield flickerOn.schedule(Duration.ticks(time += flickerInterval), ScheduleMode.Append);
	}
});



// y = (x^2 + z^2) / 5
datapack.setFunction(namespace.getID("paraboloid"), function*() {
	const coefficient = 1/5;
	const constant = yOrigin;

	yield new Execute().as(allMarkers).run(
		datapack.setFunction(internalId.getID("set_paraboloid"), function*() {
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
		}).run()
	);
});


// y = (x^2 - z^2) / 5
datapack.setFunction(namespace.getID("saddle"), function*() {
	// same as paraboloid, but subtract instead of add
	const coefficient = 1/5;
	const constant = yOrigin;

	yield new Execute().as(allMarkers).run(
		datapack.setFunction(internalId.getID("set_saddle"), function*() {
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
		}).run()
	);
});

const sineInput = scoreAllocator.score();
const sineOutput = scoreAllocator.score();
const calcSine = datapack.setFunction(internalId.getID("calc_sine"), function*() {
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
	yield new Execute().if(sineInput.greaterThan(1 * resolution)).run(
		sineOutput.multiplyScore(scoreAllocator.constant(-1))
	);
});

// y = sine(x / 3 + frame) + sine(z / 3 + frame) + altitude;
datapack.setFunction(namespace.getID("sine"), function*() {
	yield new Execute().as(allMarkers).run(
		datapack.setFunction(internalId.getID("set_sine"), function*() {
			// x
			yield sineInput.assignCommand(selfX.getValue(resolution / 3));
			yield sineInput.addScore(frame);
			yield calcSine.run();
			const temp = scoreAllocator.score();
			yield temp.assignScore(sineOutput);

			// z
			yield sineInput.assignCommand(selfZ.getValue(resolution / 3));
			yield sineInput.addScore(frame);
			yield calcSine.run();

			yield temp.addScore(sineOutput);
			
			yield temp.addScore(scoreAllocator.constant(yOrigin * resolution));

			yield selfY.assignScore(temp, NumericDataType.Double, 1 / resolution);
		}).run()
	);
});

// y = sine((x * x + z * z) / 8 + frame) + altitude;
datapack.setFunction(namespace.getID("ripple"), function*() {
	yield new Execute().as(allMarkers).run(
		datapack.setFunction(internalId.getID("set_ripple"), function*() {
			const xScore = sineInput;
			const zScore = scoreAllocator.score();
			yield xScore.assignCommand(selfX.getValue(resolution));
			yield zScore.assignCommand(selfZ.getValue(resolution));

			yield xScore.multiplyScore(xScore);
			yield zScore.multiplyScore(zScore);

			yield xScore.addScore(zScore); // res = 2

			yield xScore.divideScore(scoreAllocator.constant(8 * resolution)); // res = 1
			yield xScore.addScore(frame);

			yield calcSine.run();

			yield sineOutput.addScore(scoreAllocator.constant(yOrigin * resolution));

			yield selfY.assignScore(sineOutput, NumericDataType.Double, 1 / resolution);
		}).run()
	);
});


datapack.setFunction(namespace.getID("animate"), function*() {
	yield new Execute().if(panX.lessThan(-1 * resolution)).run(
		panVelocityX.assignConstant(panSpeedX * resolution)
	);

	yield new Execute().if(panZ.lessThan(-1 * resolution)).run(
		panVelocityZ.assignConstant(panSpeedZ * resolution)
	);

	yield new Execute().if(panX.greaterThan(1.5 * resolution)).run(
		panVelocityX.assignConstant(-panSpeedX * resolution)
	);

	yield new Execute().if(panZ.greaterThan(1.5 * resolution)).run(
		panVelocityZ.assignConstant(-panSpeedZ * resolution)
	);

	yield panX.addScore(panVelocityX);
	yield panZ.addScore(panVelocityZ);

	yield frame.addScore(scoreAllocator.constant(frameSpeed * resolution));
});


console.log("Writing files...");
await writeFiles(outputPath, datapack.build());
console.log("Complete!");