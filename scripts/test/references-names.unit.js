#!/usr/bin/env node
// Folder names in a reference library are read loosely: case, singular or plural, a numbered prefix,
// and the words people use (Cast, Backgrounds, Outfits, camera moves). A folder no kind claims is
// reported as unrecognised, never guessed. The library is found under references, refs or assets,
// or is the footage folder itself when it holds kind folders directly.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const R = require('../lib-references.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-refnames-'));
const touch = f => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); };

// Every spelling lands on its kind.
const cases = {
  'Cast': 'characters', 'talent': 'characters', 'ACTORS': 'characters', '01. Characters': 'characters',
  'Backgrounds': 'locations', 'background': 'locations', 'BG': 'locations', 'sets': 'locations', 'Environments': 'locations', '3_Locations': 'locations',
  'Outfits': 'wardrobe', 'costume': 'wardrobe', 'Wardrobe': 'wardrobe',
  '2. Props': 'props', 'Products': 'props', 'objects': 'props',
  'camera moves': 'motion', 'Camera_Moves': 'motion', 'Motion': 'motion', 'reference-videos': 'motion',
};
for (const [folder, kind] of Object.entries(cases)) assert.strictEqual(R.kindOf(folder), kind, folder + ' should read as ' + kind);
for (const folder of ['misc', 'old stuff', 'Drafts']) assert.strictEqual(R.kindOf(folder), null, folder + ' is claimed by no kind');

// A library called "Refs" under the footage folder, with loose names and one folder nobody claims.
const drive1 = path.join(tmp, 'shoot1'); const refs = path.join(drive1, 'Refs');
touch(path.join(refs, 'Cast', 'maya', 'front.png'));
touch(path.join(refs, 'Backgrounds', 'apartment.jpg'));
touch(path.join(refs, 'Backgrounds', 'stairwell_1.jpg')); touch(path.join(refs, 'Backgrounds', 'stairwell_2.jpg'));
touch(path.join(refs, '2. Props', 'old-key.png'));
touch(path.join(refs, 'Outfits', 'raincoat', 'a.webp'));
touch(path.join(refs, 'camera moves', 'P03.mp4'));
touch(path.join(refs, 'misc', 'notes.png'));
assert.strictEqual(R.libraryRoot({ driveFolder: drive1 }).replace(/\\/g, '/'), refs.replace(/\\/g, '/'), 'the Refs folder is found');
const lib = R.scanLibrary(R.libraryRoot({ driveFolder: drive1 }));
const names = k => lib.items.filter(i => i.kind === k).map(i => i.name).sort();
assert.deepStrictEqual(names('characters'), ['maya']);
assert.deepStrictEqual(names('locations'), ['apartment', 'stairwell'], 'numbered files group under one name');
assert.strictEqual(lib.items.find(i => i.name === 'stairwell').images.length, 2);
assert.deepStrictEqual(names('props'), ['old-key']);
assert.deepStrictEqual(names('wardrobe'), ['raincoat']);
assert.deepStrictEqual(names('motion'), ['P03']);
assert.deepStrictEqual(lib.unrecognised, ['misc'], 'an unclaimed folder is reported, not guessed');
assert.strictEqual(lib.folders['Backgrounds'], 'locations');

// No references folder, but kind folders straight in the footage folder: the footage folder is the library.
const drive2 = path.join(tmp, 'shoot2');
touch(path.join(drive2, 'footage', 'day-01', 'A001.mp4'));
touch(path.join(drive2, 'Background', 'harbour.png'));
touch(path.join(drive2, 'Characters', 'mei.png'));
assert.strictEqual(R.libraryRoot({ driveFolder: drive2 }).replace(/\\/g, '/'), drive2.replace(/\\/g, '/'));
const lib2 = R.scanLibrary(R.libraryRoot({ driveFolder: drive2 }));
assert.deepStrictEqual(lib2.items.map(i => i.kind + ':' + i.name).sort(), ['characters:mei', 'locations:harbour']);
assert.deepStrictEqual(lib2.unrecognised, [], 'the footage folder itself is not reported as unrecognised');

// An explicit referencesFolder wins over everything.
assert.strictEqual(R.libraryRoot({ driveFolder: drive1, referencesFolder: '/elsewhere' }), '/elsewhere');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('references-names.unit: loose folder names, library discovery and unrecognised folders all correct');
