'use strict';

function lengthCode(length) {
	if (length > 2) {
		if (length < 11) { return +length + 254; }
		if (length < 19) { return ((length - 11) >>> 1) + 265; }
		if (length < 35) { return ((length - 19) >>> 2) + 269; }
		if (length < 67) { return ((length - 35) >>> 3) + 273; }
		if (length < 131) { return ((length - 67) >>> 4) + 277; }
		if (length < 258) { return ((length - 131) >>> 5) + 281; }
		if (length < 259) { return 285; }
	}

	throw new RangeError('invalid backreference length: ' + length);
}

function distanceCode(distance) {
	if (distance > 1) {
		if (distance < 5) { return distance - 1; }
		if (distance < 9) { return ((distance - 5) >>> 1) + 4; }
		if (distance < 17) { return ((distance - 9) >>> 2) + 6; }
		if (distance < 33) { return ((distance - 17) >>> 3) + 8; }
		if (distance < 65) { return ((distance - 33) >>> 4) + 10; }
		if (distance < 129) { return ((distance - 65) >>> 5) + 12; }
		if (distance < 257) { return ((distance - 129) >>> 6) + 14; }
		if (distance < 513) { return ((distance - 257) >>> 7) + 16; }
		if (distance < 1025) { return ((distance - 513) >>> 8) + 18; }
		if (distance < 2049) { return ((distance - 1025) >>> 9) + 20; }
		if (distance < 4097) { return ((distance - 2049) >>> 10) + 22; }
		if (distance < 8193) { return ((distance - 4097) >>> 11) + 24; }
		if (distance < 16385) { return ((distance - 8193) >>> 12) + 26; }
		if (distance < 32769) { return ((distance - 16385) >>> 13) + 28; }
	}

	throw new RangeError('invalid backreference distance: ' + distance);
}

function getBackreferences(buffer, options) {
	var windowSize = options && options.windowSize || 32768;

	if (buffer.length <= 3) {
		// Edge case: there can't be any backrefs
		return [];
	}

	// GC friendly memory allocation
	var pool = [];

	// Trigrams are pointers to the place where three
	// specific consecutive bytes were encountered
	var trigrams = Object.create(null);
	var prevTrigrams = Object.create(null);
	var rawBackrefs = [];

	for (var ptr = 0; ptr < buffer.length - 2; ptr++) {
		if (ptr % windowSize === 0) {
			// Two dictionaries are used
			// Their lifespan is limited to windowSize * 2
			for (var key in prevTrigrams) {
				for (var trigram = trigrams[hash]; trigram; trigram = trigram.next) {
					// Recycle object
					pool.push(trigram);
				}
			}

			prevTrigrams = trigrams;
			trigrams = Object.create(null);
		}

		// Any particular hashing
		var hash = String.fromCharCode(buffer[ptr], buffer[ptr + 1], buffer[ptr + 2]);

		if (!trigrams[hash] && prevTrigrams[hash]) {

			// There is nothing in the "newer hash"
			// but the "older" one contains data
			// Move it to the new hash.
			// Items that weren't moved will eventually be freed
			trigrams[hash] = prevTrigrams[hash];
			prevTrigrams[hash] = undefined;
		}

		var backrefsAtPtr = null;
		var backrefsAtPrevPtr = null;
		if (rawBackrefs.length > 0) {
			backrefsAtPrevPtr = rawBackrefs[rawBackrefs.length - 1];
		}

		// Trigrams is a dictionary of singly linked lists
		matching_loop: for (var trigram = trigrams[hash]; trigram; trigram = trigram.next) {
			var sourcePtr = trigram.sourcePtr;
			if (sourcePtr < ptr - windowSize) {
				// We can't reach so far
				// Discard a SLL head and the following item becomes a new head
				trigrams[hash] = trigram.next;

				// Recycle object
				pool.push(trigram);

				continue;
			}

			var maxLength = Math.min(buffer.length - sourcePtr, 258);
			var length = 3;
			for (; length < maxLength; length++) {
				if (buffer[sourcePtr + length] !== buffer[ptr + length]) {
					// Fast forward while bytes are the same
					break;
				}
			}

			// Check if this backref is already contained within the other one
			if (backrefsAtPrevPtr) {
				for (var i = 0; i < backrefsAtPrevPtr.length; i++) {
					if (sourcePtr + length <= backrefsAtPrevPtr[i].sourcePtr + backrefsAtPrevPtr[i].length) {
						continue matching_loop;
					}
				}
			}

			if (!backrefsAtPtr) {
				backrefsAtPtr = [];
			}

			backrefsAtPtr.push({sourcePtr: sourcePtr, targetPtr: ptr, length: length});
		}

		if (backrefsAtPtr) {
			rawBackrefs.push(backrefsAtPtr);
		}

		// Allocate or create a new object
		var newTrigram = pool.pop() || {};

		// Write or re-write its properties
		// Note: It's vital for V8 performance that properties are assigned in same order
		newTrigram.sourcePtr = ptr;
		newTrigram.next = null;

		if (!trigrams[hash]) {
			// Create a new head
			trigrams[hash] = newTrigram;
		} else {
			// Append
			trigrams[hash].next = newTrigram;
		}
	}

	return rawBackrefs;
}

exports.getBackreferences = getBackreferences;
exports.lengthCode = lengthCode;
