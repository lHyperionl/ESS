import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as fs from "node:fs";
import { peekFile, peekFileEnds, peekFileSync, peekFileTail } from "@oh-my-pi/pi-utils/peek-file";
import { TempDir } from "@oh-my-pi/pi-utils/temp";

describe("file peek boundaries and cleanup", () => {
	let dir: TempDir;

	beforeEach(async () => {
		dir = await TempDir.create("@omp-peek-errors-");
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await dir.remove();
	});

	it("reads a synchronous header larger than the initial shared buffer", async () => {
		const content = Uint8Array.from({ length: 8192 }, (_, index) => index % 251);
		const file = dir.join("large.bin");
		await Bun.write(file, content);
		const result = peekFileSync(file, 4096, bytes => bytes.slice());
		expect(result).toEqual(content.slice(0, 4096));
	});

	it("returns the synchronous callback result without opening a file for a zero budget", () => {
		const result = peekFileSync(dir.join("missing.bin"), 0, bytes => {
			expect(bytes).toEqual(new Uint8Array(0));
			return "empty header";
		});
		expect(result).toBe("empty header");
	});

	it("returns the asynchronous callback result without opening a file for a negative budget", async () => {
		const result = await peekFile(dir.join("missing.bin"), -1, bytes => {
			expect(bytes).toEqual(new Uint8Array(0));
			return "empty header";
		});
		expect(result).toBe("empty header");
	});

	it("returns an empty tail and closes the handle for an empty file", async () => {
		const file = dir.join("empty.bin");
		await Bun.write(file, "");
		const handle = await fs.promises.open(file, "r");
		vi.spyOn(fs.promises, "open").mockResolvedValueOnce(handle);
		try {
			expect(await peekFileTail(file, 32, bytes => bytes.slice())).toEqual(new Uint8Array(0));
			await expect(handle.stat()).rejects.toHaveProperty("code", "EBADF");
		} finally {
			await handle.close();
		}
	});

	it("preserves a synchronous read error and closes the descriptor", async () => {
		const file = dir.join("sync-error.bin");
		await Bun.write(file, "content");
		const fd = fs.openSync(file, "r");
		const failure = new Error("simulated read failure");
		vi.spyOn(fs, "openSync").mockReturnValueOnce(fd);
		vi.spyOn(fs, "readSync").mockImplementationOnce(() => {
			throw failure;
		});
		try {
			expect(() => peekFileSync(file, 4, bytes => bytes.length)).toThrow(failure);
			expect(() => fs.fstatSync(fd)).toThrow(expect.objectContaining({ code: "EBADF" }));
		} finally {
			try {
				fs.closeSync(fd);
			} catch {
				// Normally already closed; still attempt cleanup if an assertion fails earlier.
			}
		}
	});

	it("preserves an asynchronous read error and closes the handle", async () => {
		const file = dir.join("async-error.bin");
		await Bun.write(file, "content");
		const handle = await fs.promises.open(file, "r");
		const failure = new Error("simulated read failure");
		vi.spyOn(fs.promises, "open").mockResolvedValueOnce(handle);
		vi.spyOn(handle, "read").mockRejectedValueOnce(failure);
		try {
			await expect(peekFile(file, 4, bytes => bytes.length)).rejects.toBe(failure);
			await expect(handle.stat()).rejects.toHaveProperty("code", "EBADF");
		} finally {
			await handle.close();
		}
	});

	it("closes the header handle when the consumer callback throws", async () => {
		const file = dir.join("callback-error.bin");
		await Bun.write(file, "header");
		const handle = await fs.promises.open(file, "r");
		const failure = new Error("consumer failed");
		vi.spyOn(fs.promises, "open").mockResolvedValueOnce(handle);
		try {
			await expect(
				peekFile(file, 6, bytes => {
					expect(new TextDecoder().decode(bytes)).toBe("header");
					throw failure;
				}),
			).rejects.toBe(failure);
			await expect(handle.stat()).rejects.toHaveProperty("code", "EBADF");
		} finally {
			await handle.close();
		}
	});

	it("preserves a tail stat error and closes the handle", async () => {
		const file = dir.join("stat-error.bin");
		await Bun.write(file, "content");
		const handle = await fs.promises.open(file, "r");
		const failure = new Error("simulated stat failure");
		vi.spyOn(fs.promises, "open").mockResolvedValueOnce(handle);
		const stat = vi.spyOn(handle, "stat").mockRejectedValueOnce(failure);
		try {
			await expect(peekFileTail(file, 4, bytes => bytes.length)).rejects.toBe(failure);
			stat.mockRestore();
			await expect(handle.stat()).rejects.toHaveProperty("code", "EBADF");
		} finally {
			await handle.close();
		}
	});

	it("closes the shared handle when the head-and-tail consumer throws", async () => {
		const file = dir.join("ends-error.bin");
		await Bun.write(file, "HEAD-middle-TAIL");
		const handle = await fs.promises.open(file, "r");
		const failure = new Error("consumer failed");
		vi.spyOn(fs.promises, "open").mockResolvedValueOnce(handle);
		try {
			await expect(
				peekFileEnds(file, 4, 4, (head, tail) => {
					expect(new TextDecoder().decode(head)).toBe("HEAD");
					expect(new TextDecoder().decode(tail)).toBe("TAIL");
					throw failure;
				}),
			).rejects.toBe(failure);
			await expect(handle.stat()).rejects.toHaveProperty("code", "EBADF");
		} finally {
			await handle.close();
		}
	});
});
