'use strict';

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

			var maxLength = Math.min(buffer.length - sourcePtr, windowSize);
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
