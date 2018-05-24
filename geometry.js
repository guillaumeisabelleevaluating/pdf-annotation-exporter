
// Functions dealing with geometry , box overlap, etc.

// Return true if the first box is within the second box.
function isWithinBox(child,parent) {

    return (child[0].x >= parent[0].x &&
            child[0].y >= parent[0].y &&
            child[1].x <= parent[1].x &&
            child[1].y <= parent[1].y);

}

function isOverlapped(child, parent) {

    // FIXME we should require that the overlap at LEAST have say a certain
    // percentage of the Y dimension to be at least 35% of the text.  This way
    // if we get partial text we still allow it but we don't accidentally pull
    // in the previous paragraph.

    return computeOverlap(child,parent) > 0;

}

// compute the overlap of two rectangles.
function computeOverlap(child, parent) {

    // compute the overlap box

    var x_overlap = Math.max(0, Math.min(child[1].x, parent[1].x) - Math.max(child[0].x, parent[0].x));
    var y_overlap = Math.max(0, Math.min(child[1].y, parent[1].y) - Math.max(child[0].y, parent[0].y));

    return x_overlap * y_overlap;

}

/**
 * Compute the amount of overlap between parent and child.  Return additional
 * metadata including the overlap per dimension.
 *
 * @param child
 * @param parent
 */
function computeOverlap2(child, parent) {

    var result = {};

    result.overlapX = computeOverlapWithinDimension(child, parent, function(box) { return box.x;} );
    result.overlapY = computeOverlapWithinDimension(child, parent, function(box) { return box.y;} );

    result.overlap = result.overlapX.overlap & result.overlapY.overlap;

    return result;

}

/**
 * Compute the overlap in a specific dimension (x, or y) with the given function.
 *
 */
function computeOverlapWithinDimension(child, parent, extractDim) {

    var result = {};

    // the number of coordinates in the given dimension that are overlapped.
    result.overlap
        = Math.max(0,
        Math.min(extractDim(child[1]), extractDim(parent[1])) -
        Math.max(extractDim(child[0]), extractDim(parent[0])));

    // now compute the child and parent coverage
    result.childCoverage = result.overlap / extractDim(child);

    result.parentPoverage = result.overlap / extractDim(parent);

    return result;

}