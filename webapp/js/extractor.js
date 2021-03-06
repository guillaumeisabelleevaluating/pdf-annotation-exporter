
// chrome supports the following image types.  image/png , image/jpeg, and image/webp

const IMAGE_TYPE = 'image/png';
const IMAGE_QUALITY = 1.0;

function _arrayBufferToBase64( buffer ) {
    let binary = '';
    let bytes = new Uint8Array( buffer );
    let len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return window.btoa( binary );
}

/**
 * Convert the given canvas to a data URL and return it as a string.  The
 * internal toDataURL on canvas will resize the image and mess with quality
 * and this is always high fidelity.
 *
 */
async function toDataURLHD(canvas) {

    // https://developer.mozilla.org/en-US/docs/Web/API/Blob
    //
    return new Promise(function(resolve, reject) {

         canvas.toBlob(function (blob) {

            let reader = new FileReader();

            reader.addEventListener("onloadstart", function (err) {
                reject(err);
            });

            reader.addEventListener("loadend", function () {
                let encoded = _arrayBufferToBase64(reader.result);
                resolve(`data:${IMAGE_TYPE};base64,` + encoded);
            });

            reader.addEventListener("onerror", function (err) {
                reject(err);
            });

            reader.addEventListener("onabort", function (err) {
                reject(err);
            });

            reader.readAsArrayBuffer(blob);

         }, IMAGE_TYPE, IMAGE_QUALITY);

    });

}

/**
 * Get the annotations from a specific page.
 */
async function getAnnotations(page, extractionOptions) {

    // textAnnotation and highlightAnnotation

    let highlights = page.querySelectorAll(".annotationLayer .highlightAnnotation")
    console.log(highlights);

    let result = [];

    let highlightAnnotations = getAnnotationElements(page, "highlight");
    let squareAnnotations = getAnnotationElements(page, "square");
    let textAnnotations = getAnnotationElements(page, "text");

    //console.log("Found text annotations: ", textAnnotations);

    // TODO: we can probably get all of these in one pass.
    let annotations
        = highlightAnnotations
        .concat(squareAnnotations)
        .concat(textAnnotations);

    for(let idx = 0; idx < annotations.length; ++idx) {
        let current = annotations[idx];

        let highlightElement = current.annotation;

        let highlightRegion = toElementRegion(highlightElement);
        let highlightBox = regionToBox(highlightRegion);

        let highlightRegionWithScale = getScaledElementRegion(highlightElement);
        let highlightBoxWithScale = regionToBox(highlightRegionWithScale);

        if(isSkippable(page, highlightRegionWithScale)) {
            continue;
        }

        let comment = {};

        if (current.popup) {
            comment = parsePopupAnnotation(current.popup);
        }

        let image = null;
        let linesOfText = [];

        if (current.type !== 'text') {

            linesOfText = getHighlightLinesOfText(page, highlightBox, highlightBoxWithScale, comment, extractionOptions);

            if (! extractionOptions.noAnnotationImages && highlightRegion.area > 0) {
                image = await getHighlightImage(page, highlightBoxWithScale);
            }

        }

        let highlight = {
            box: highlightBox,
            linesOfText,
            image,
            boxWithScale: highlightBoxWithScale,
            comment,
            type: current.type
        };

        result.push(highlight);

    }

    return result;

}

/**
 *  Return true if the given annotation is skippable
 */
function isSkippable(page, highlightRegionWithScale) {

    let canvas = getPageCanvas(page);
    let canvasArea = canvas.offsetWidth * canvas.offsetHeight;
    let highlightArea = highlightRegionWithScale.width * highlightRegionWithScale.height;
    let coverage = highlightArea / canvasArea;

    // most annotations would never take up this much space so it must be an
    // annotation over an entire page. I was using these as 'page marks' to track
    // my reading and I need a way to remove them. For normal users these should
    // never come up but I need a way to mark them in the future.
    return coverage > 0.9 || (highlightRegionWithScale.left === 0 && highlightRegionWithScale.top === 0);

}

// TODO: this could be more efficient by using an index of the offsets so that
// we only have to search within the offsets and dimensions that we're
// interested in.

function getHighlightLinesOfText(page, highlightBox) {

    let textElements = page.querySelectorAll(".textLayer div");

    let linesOfText = [];

    for(let idx = 0; idx < textElements.length; ++idx) {

        let textElement = textElements[idx];

        let elementRegion = toElementRegion(textElement);
        let elementBox = regionToBox(elementRegion);

        if (isElementHighlighted(elementBox, highlightBox)) {
            linesOfText.push(textElement.outerText);
        }

    }

    return linesOfText;

}

function parsePopupAnnotation(popupElement) {

    let dataElement = popupElement.querySelector(".popup");

    return {

        // TODO: might want to filter these for
        author: Optional.of(dataElement.querySelector("h1")).map(function(element) {
            return element.textContent;
        }).getOrElse(null),

        text: Optional.of(dataElement.querySelector("p")).map(function(element) {
            return element.textContent;
        }).getOrElse(null)

    };

}

async function getHighlightImage(page, highlightBox) {

    let canvas = getPageCanvas(page);

    //FIXME: it's definitely the resulting image though.  NOT the input ...
    // so it's either the CANVAS or it's my copying the data.

    // FIXME: this returns true but it might be because it is being reset...
    //console.log("FIXME: main canvas has image smoothing enabled: "  + canvas.getContext('2d').imageSmoothingEnabled)

    // FIXME: this is STILL not working.  The serif on the 's' is fucked but
    // I think we're getting farther. the toDataURLHD isn't the issue here.
    //
    // I think for most of the images they're correct.

    let tmpCanvas = document.createElement("canvas");

    let tempCanvasCtx = tmpCanvas.getContext('2d', {alpha: false});
    console.log("FIXME: current tempCanvasCtx.imageSmoothingEnabled: " + tempCanvasCtx.imageSmoothingEnabled);
    tempCanvasCtx.imageSmoothingEnabled = false;

    console.log("FIXME: temp canvas has image smoothing enabled: "  + tmpCanvas.getContext('2d').imageSmoothingEnabled)

    let highlightRegion = boxToRegion(highlightBox);

    tmpCanvas.width  = highlightRegion.width;
    tmpCanvas.height = highlightRegion.height;

    const originX = 0;
    const originY = 0;

    tempCanvasCtx.drawImage(canvas,
                            highlightRegion.left, highlightRegion.top, highlightRegion.width, highlightRegion.height,
                            originX, originY, highlightRegion.width, highlightRegion.height );

    // TODO: toDataURL returns in 96DPI but we should return it in a higher
    // resolution I think however I guess a picture of text will just never look
    // appropriate.  This 96DPI comment makes no sense because they're jsut
    // pixels... There should be no hard width

    //let dataURL = await toDataURLHD(tmpCanvas);
    let dataURL = tmpCanvas.toDataURL(IMAGE_TYPE, IMAGE_QUALITY);

    return {
        src: dataURL,
        width: highlightRegion.width,
        height: highlightRegion.height
    };

}

function logImage(src) {
    console.log('%c       ', 'font-size: 100px; background: url(' + src + ') no-repeat;');
}

function getPageCanvas(page) {
    return page.querySelector("canvas");
}

function getImage(page) {
    let canvas = getPageCanvas(page);
    return canvas.toDataURL(IMAGE_TYPE, IMAGE_QUALITY);
}

// A region is like a box but based on left, top, width, height.
function createRegion(left, top, width, height) {
    var area = width * height;
    return {left: left, top: top, width: width, height: height, area: area};
}

// Take a region and convert it to a box.
function regionToBox(region) {
    return createBox(createPoint(region.left, region.top),
                     createPoint(region.left + region.width, region.top + region.height));
}

function boxToRegion(box) {
    return createRegion(box[0].x, box[0].y, box[1].x - box[0].x, box[1].y - box[0].y);
}

// create a tuple with two points
function createBox(point0, point1) {
    return [point0, point1];
}

// A euclidian point
function createPoint(x,y) {
    return {x: x, y: y};
}

function getScaledElementRegion(element) {

    // the width and height here are what we want and don't need to be scaled.
    let boundingClientRect = element.getBoundingClientRect();

    let scales = parseTransformScale(element.style.transform);

    let scaleX = scales[0];
    let scaleY = scales[1];

    return {left: element.offsetLeft * scaleX,
            top: element.offsetTop * scaleY,
            width: boundingClientRect.width,
            height: boundingClientRect.height };

}


function parseTransformScale(transform) {

    // element.style.transform

    // parseTransformScale("matrix(2.66667, 0, 0, 2.66667, 0, 0)");

    transform = transform.replace("matrix(", "");
    transform = transform.replace(")", "");

    let splitData = transform.split(", ")

    return [parseFloat(splitData[0]), parseFloat(splitData[3])];

}

function toElementRegionUsingOffset(element) {

    // TODO: I could return this just as a box.
    return createRegion(element.offsetLeft, element.offsetTop, element.offsetWidth, element.offsetHeight);
}


// Take an element and convert it to a box by using its offsets.
function toElementRegion(element) {

    let clientRect = element.getBoundingClientRect()

    // TODO: I could return this just as a box.
    return createRegion(clientRect.left, clientRect.top, clientRect.right - clientRect.left, clientRect.bottom - clientRect.top);
}

// return true if the element is highlighted
function isElementHighlighted(b0,b1) {

    return isOverlapped(b0, b1);

}

function assertTrue(value) {
    if (!value)
        throw Error();
}

function test() {

    let within = createBox(createPoint(0,0),createPoint(100,100));
    let box0 = createBox(createPoint(0,0),createPoint(100,100));

    assertTrue(isWithinBox(box0, within));

    let box1 = createBox(createPoint(10,10),createPoint(20,20));
    assertTrue(isWithinBox(box1, within));


}

async function extractPage(page, extractionOptions) {

    let annotations = await getAnnotations(page, extractionOptions);

    //var image = getImage(page);

    // TODO: no image for now because it's too much data. Make this an option
    // in the future.
    let image = null;

    return {annotations, image};

}

/**
 * Get all annotations on the page for the given type and include their popup
 * annotations for extracting text from them.
 *
 * Types:
 *  - highlight   - text that is highlighted on the page. this also includes a form
 *                  of annotation that is a square rectangle that is highlighted.
 *  - square      - a rectangular region that is highlighted
 *  - text        - a small control with embedded text which is mostly hidden
 *
 * Return an array of objects which have annotation and popup params which are
 * elements referencing our data.
 */
function getAnnotationElements(page, type) {

    let clazz = type + "Annotation";

    let result = [];

    let annotationElements = page.querySelectorAll(".annotationLayer ." + clazz + ", .annotationLayer .popupAnnotation")

    for (let idx = 0; idx < annotationElements.length; ++idx) {

        let annotationElement = annotationElements[idx];

        if (annotationElement.getAttribute("class") === clazz) {

            let entry = { type: type, annotation: null, popup: null};
            entry.annotation = annotationElement;

            // now see if we have an associated popup by looking ahead to the
            // next annotation.

            let nextAnnotationElement = annotationElements[idx+1];

            if (nextAnnotationElement && nextAnnotationElement.getAttribute("class") === "popupAnnotation") {
                entry.popup = nextAnnotationElement.querySelector(".popupWrapper");
            }

            // for square annotations, they have the popupWrapper internally..
            // which is annoying and confusing.

            if ( ! entry.popup ) {
                entry.popup = annotationElement.querySelector(".popupWrapper");
            }

            result.push(entry);

        }

    }

    return result;

}

async function doExtraction(extractionOptions) {

    let result = {
        pages: []
    };

    let pages = document.querySelectorAll(".page");

    for(let idx = 0; idx < pages.length; ++idx) {
        let page = pages[idx];

        let canvas = getPageCanvas(page);
        if (! canvas)
            continue;

        let pageExtract = await extractPage(page, extractionOptions);
        result.pages.push(pageExtract);

    }

    return result;

}

function isHeadlessChrome() {
    return navigator.userAgent.indexOf("HeadlessChrome") !== -1;
}

function createExtractionOptions() {
    return {noPageImages: false, noAnnotationImages: false};
}
