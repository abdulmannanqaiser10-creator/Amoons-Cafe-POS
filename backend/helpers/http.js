/**
 * Shared HTTP responses for the admin controllers. The order, shift and
 * settings controllers predate this file and keep their own copies; new
 * modules use these so a duplicate key never surfaces as a 500.
 */

const badRequest = (res, message) => res.status(400).json({ message });

const notFound = (res, message = "Not found") =>
  res.status(404).json({ message });

const conflict = (res, message) => res.status(409).json({ message });

const serverError = (res, error) => {
  console.error(error);
  res.status(500).json({ message: "Server error" });
};

/**
 * Translates the Postgres error codes that a form can realistically trigger
 * into the message an operator can act on.
 *
 * `unique` is keyed by the column the caller cares about ("name", "phone");
 * the constraint Postgres reports is matched by containing that column, which
 * covers both the inline UNIQUE and a named expression index.
 */
function databaseProblem(error, { unique = {} } = {}) {
  if (error?.code === "23505") {
    const constraint = String(error.constraint ?? "").toLowerCase();
    const key = Object.keys(unique).find((column) =>
      constraint.includes(column.toLowerCase())
    );

    return {
      status: 409,
      message: key ? unique[key] : "That record already exists.",
    };
  }

  if (error?.code === "23503") {
    return {
      status: 409,
      message: "Still referenced by other records.",
    };
  }

  if (error?.code === "22P02") {
    return { status: 400, message: "A value in that form is not a valid number." };
  }

  if (error?.code === "23514") {
    return { status: 400, message: "A value in that form is out of range." };
  }

  return null;
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Trims and caps a text field, returning null for an empty value. */
function text(value, max) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  return trimmed.slice(0, max);
}

module.exports = {
  badRequest,
  notFound,
  conflict,
  serverError,
  databaseProblem,
  round2,
  toNumber,
  text,
};
