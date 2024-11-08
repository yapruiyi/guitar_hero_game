/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";

import { fromEvent, interval,  from, of, merge } from "rxjs";
import { map, filter, scan, concatMap, delay, mergeWith, takeUntil, endWith, take, repeat, takeWhile, switchMap, mergeMap, startWith } from "rxjs/operators";
import * as Tone from "tone";
import { SampleLibrary } from "./tonejs-instruments";
import { Instrument } from "tone/build/esm/instrument/Instrument";
import { not } from "rxjs/internal/util/not";

/** Constants */

const Viewport = {
    CANVAS_WIDTH: 200,
    CANVAS_HEIGHT: 400,
} as const;

const Constants = {
    TICK_RATE_MS: 25,//500,
    SONG_NAME: "RockinRobin",
} as const;

const Note = {
    RADIUS: 0.07 * Viewport.CANVAS_WIDTH,
    TAIL_WIDTH: 10,
    circleStartTime: 0,
    circleExpirationTime: 1000
};

/** User input */ 

type Key = "KeyH" | "KeyJ" | "KeyK" | "KeyL" | "KeyP" | "KeyU" | "KeyR";

type Event = "keydown" | "keyup" | "keypress";

/** Utility functions */

/** State processing */ // model is here


type line = Readonly<{
    id:string,
    createdTime:number,
    x1: number,
    x2: number,
    y1: number,
    y2: number,
    colour: string,
    stroke_width: number
  }>;

//Body indicates the notes to be shown in canvas and user needs to play
type Body = Readonly<{
    id:string,
    createdTime:number,
    x: number,
    y: number,
    colour: string,
    note: string[],
    distorted: boolean,
    line?: line,
    tapped: boolean
  }>;

type State = Readonly<{
    circles: ReadonlyArray<Body>,
    exit: ReadonlyArray<Body>,
    totaltime: number, // in milliseconds
    notes_to_play: string[][],
    notes_to_load: string[][],
    gameEnd: boolean,
    objCount: number,
    playnote_csv_index: number, // to keep track of the lastest note played thus far 
    score: number,
    combo: number,
    multiplier: number,
    hold_duration: number,
    hold: boolean,
    tap: boolean,
    play_random_note: boolean,
    missed_notes: number,
    current_seed: number
}>;

const initialState = {
    circles: [] as ReadonlyArray<Body>,
    exit: [] as ReadonlyArray<Body>,
    totaltime: 0,
    notes_to_play: [] as string[][],
    notes_to_load: [] as string[][],
    gameEnd: false,
    objCount: 0,
    playnote_csv_index: 0, 
    score: 0,
    combo: 0,
    multiplier: 1,
    hold_duration: 0,
    hold: false,
    tap: false,
    play_random_note: false,
    missed_notes: 0,
    current_seed: 10
} as const;

abstract class RNG {
    // LCG using GCC's constants
    public static m = 0x80000000; // 2**31
    public static a = 1103515245;
    public static c = 12345;

    /**
     * Call `hash` repeatedly to generate the sequence of hashes.
     * @param seed
     * @returns a hash of the seed
     */
    public static hash = (seed: number) => (RNG.a * seed + RNG.c) % RNG.m;

    /**
     * Takes hash value and scales it to the range [0, 1]
     */
    public static scale = (hash: number) => (1 * hash) / (RNG.m - 1);
}




const createline = (s:State) => (x: number) => (colour: string) =>( index: number): line => {
    return {
        id:  `line${s.objCount + index}`, // created line id number will be same as created circle
        createdTime: s.totaltime,
        x1: x,
        x2: x,
        y1: 0,
        y2: 0,
        colour: colour,
        stroke_width: 15
      }
}

// createcircles function to be used in tick action
const createCircles = (s:State) => (index: number) => (item: string[]): Body => {
    const new_x = 20 + (getRandomInt(4, s) * 20);

    if (new_x == 20) {
        return {
            id: `circle${s.objCount + index}`,
            createdTime: s.totaltime,
            x: new_x,
            y: 0,
            colour: "fill: green",
            note: item,
            distorted: false,
            line: Number(item[5]) - Number(item[4]) > 1 ? createline(s)(new_x)("green")(index) : undefined,
            tapped: false
        }
    }
    else if (new_x == 40){
        return {
            id: `circle${s.objCount + index}`,
            createdTime: s.totaltime,
            x: new_x,
            y: 0,
            colour: "fill: red",
            note: item,
            distorted: false,
            line: Number(item[5]) - Number(item[4]) > 1 ? createline(s)(new_x)("red")(index) : undefined,
            tapped: false
        }
    }
    else if (new_x == 60){
        return {
            id: `circle${s.objCount + index}`,
            createdTime: s.totaltime,
            x: new_x,
            y: 0,
            colour: "fill: blue",
            note: item,
            distorted: false,
            line: Number(item[5]) - Number(item[4]) > 1 ? createline(s)(new_x)("blue")(index) : undefined,
            tapped: false
        }
    }


    return {
      id: `circle${s.objCount + index}`,
      createdTime: s.totaltime,
      x: new_x,
      y: 0,
      colour: "fill: yellow",
      note: item,
      distorted: false,
      line: Number(item[5]) - Number(item[4]) > 1 ? createline(s)(new_x)("yellow")(index) : undefined,
      tapped: false
    }
  }







/** Rendering (side effects) */

/**
 * Displays a SVG element on the canvas. Brings to foreground. // this is the view
 * @param elem SVG element to display
 */
const show = (elem: SVGGraphicsElement) => {
    elem.setAttribute("visibility", "visible");

    
};

/**
 * Hides a SVG element on the canvas. // this is the view
 * @param elem SVG element to hide
 */
const hide = (elem: SVGGraphicsElement) =>{
    elem.setAttribute("visibility", "hidden");

    
}

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
) => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));

    
    
    
    return elem;
};


function getRandomInt(max: number, state: State) {
    return Math.floor(RNG.scale(state.current_seed) * max);
}


function getRandomfloat(max: number, state: State) {
    return RNG.scale(state.current_seed) * max;
}



/**
 * This is the function called on page load. Your main game loop
 * should be called here.
 */
export function main(csvContents: string, samples: { [key: string]: Tone.Sampler }) {
    // Canvas elements
    const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement &
        HTMLElement;
    const preview = document.querySelector(
        "#svgPreview",
    ) as SVGGraphicsElement & HTMLElement;
    const gameover = document.querySelector("#gameOver") as SVGGraphicsElement &
        HTMLElement;
    const container = document.querySelector("#main") as HTMLElement;



    // Text fields
    
    const highScoreText = document.querySelector(
        "#highScoreText",
    ) as HTMLElement;

    //classes
    class Tick { constructor(public readonly elapsed:number) {} }
    class Tap { constructor(public readonly key:string) {} }
    class Hold { constructor(public readonly key:string, public readonly flag: boolean) {} }
    class Pause { constructor(public readonly key:string) {} }
    class Restart { constructor(public readonly key:string) {} }

    

      
    // Do something with each line
    const lines = csvContents.split("\n").slice(1); // exclude first row
          
      
    

    const note_lst = lines.map( (x, index) => x.split(",") )






    /** User input */

    const key$ = fromEvent<KeyboardEvent>(document, "keydown");
    const keyup$ = fromEvent<KeyboardEvent>(document, "keyup");
    const keyhold$ = fromEvent<KeyboardEvent>(document, "keypress");

    // This is similar to the keyObservable variable in FRP asteroids
    const fromKey = <T>(keyCode: Key, result: () => T) =>
        key$.pipe(
            filter(({ code }) => code === keyCode),
            filter(({ repeat }) => !repeat),
            map(result)
        );

    
    const fromKeyhold = (keyCode: Key) =>
        key$.pipe(
            filter(({ code }) => code === keyCode),
            filter(({ repeat }) => repeat),
            
            //switchMap is used because we only want the most recently projected observable, so that takeUntil and endWith is only executed once when user lifts up key.
            switchMap( (e) => 
                    keyhold$.pipe(
                        takeUntil(keyup$),
                        map(() => new Hold(keyCode, true)),
                        endWith(new Hold(keyCode, false)),
                    ) 
            )
            
           /*
            mergeMap( (e) => 
                keyhold$.pipe(
                    takeUntil(keyup$),
                    map(() => new Hold(keyCode, false)),
                    startWith(new Hold(keyCode, true)),
                ) 
        )
            */
        
        );
          

          
          


    const H$ = fromKey("KeyH", () => new Tap("KeyH"));
    const J$ = fromKey("KeyJ", () => new Tap("KeyJ"));
    const K$ = fromKey("KeyK", () => new Tap("KeyK"));
    const L$ = fromKey("KeyL", () => new Tap("KeyL"));
    const H_hold$ = fromKeyhold("KeyH");
    const J_hold$ = fromKeyhold("KeyJ");
    const K_hold$ = fromKeyhold("KeyK");
    const L_hold$ = fromKeyhold("KeyL");
    const P$ = fromKey("KeyP", () => new Pause("KeyP"));
    //const U$ = fromKey("KeyU", () => new Unpause("KeyU"));
    const R$ = fromKey("KeyR", () => new Restart("KeyR"));


    /** Determines the rate of time steps */
    const tick$ = interval(Constants.TICK_RATE_MS);

    /**
     * Renders the current state to the canvas. // This is the view
     *
     * In MVC terms, this updates the View using the Model.
     *
     * @param s Current state
     */
    const render = (s: State) => {
        // Add blocks to the main grid canvas
        const multiplier = document.querySelector("#multiplierText") as HTMLElement;
        const scoreText = document.querySelector("#scoreText") as HTMLElement;
        const missednotetext = document.querySelector("#Missednotes") as HTMLElement;
        

        // add and update circle on canvas
        s.circles.forEach(item => { 

            if (item.y == 0){
                // add note to top of column in canvas
                const myelement = createSvgElement(svg.namespaceURI, "circle", {
                    id: item.id,
                    r: `${Note.RADIUS}`,
                    cx: String(item.x).concat("%"),
                    cy: String(item.y),
                    style: item.colour,
                    class: "shadow",
                });


                svg.appendChild(myelement);

                if (item.line != undefined){
                    const tailelement = createSvgElement(svg.namespaceURI, "line", {
                        id: item.line.id,
                        x1: String(item.line.x1).concat("%"),
                        y1: String(item.line.y1).concat("%"),
                        x2: String(item.line.x2).concat("%"),
                        y2: String(item.line.y2).concat("%"),
                        stroke: item.line.colour,
                        "stroke-width": "15"
                    });

                    svg.appendChild(tailelement);
                    
                }
            }
            else{
                // update movement in canvas
                const old_element = document.getElementById(item.id)!; 
                //myelement.setAttribute("cy", String(item.y));
                const new_element = createSvgElement(svg.namespaceURI, "circle", {
                    id: item.id,
                    r: `${Note.RADIUS}`,
                    cx: String(item.x).concat("%"),
                    cy: String(item.y),
                    style: item.colour,
                    class: "shadow",
                });

                svg.appendChild(new_element);
                svg.removeChild(old_element);



                if (item.line != undefined){
                    const oldtail_element = document.getElementById(item.line.id)!; 
                    const tailelement = createSvgElement(svg.namespaceURI, "line", {
                        id: item.line.id,
                        x1: String(item.line.x1).concat("%"),
                        y1: String(item.line.y1).concat("%"),
                        x2: String(item.line.x2).concat("%"),
                        y2: String(item.line.y2).concat("%"),
                        stroke: item.line.colour,
                        "stroke-width": "15"
                    });

                    svg.appendChild(tailelement);
                    svg.removeChild(oldtail_element);
                    
                }

            }

        })
            

        //remove circle from canvas
        s.exit.forEach(item => {
            const myelement = document.getElementById(item.id)!; 
            svg.removeChild(myelement);

            if (item.line){
                const tailelement = document.getElementById(item.line.id)!; 
                svg.removeChild(tailelement);
            }
        })


        
        //update score on canvas
        const newscore = document.createTextNode(String(s.score));
        
        const oldchild = scoreText.lastChild
        scoreText.appendChild(newscore);
        if (oldchild)
        scoreText.removeChild(oldchild);

        const newmultiplier = document.createTextNode(String(s.multiplier));
        
        const oldmultiplierchild = multiplier.lastChild
        multiplier.appendChild(newmultiplier);
        if (oldmultiplierchild)
        multiplier.removeChild(oldmultiplierchild);

        const newmissed_score = document.createTextNode(String(s.missed_notes));
        
        const old_missedscore_child = missednotetext.lastChild
        missednotetext.appendChild(newmissed_score);
        if (old_missedscore_child)
        missednotetext.removeChild(old_missedscore_child);

        //const newmultiplier = document.createTextNode(String(s.multiplier));

        //if (multiplier.nextElementSibling) multiplier.removeChild(multiplier.nextElementSibling);
        //multiplier.appendChild(newmultiplier);
        //console.log(scoreText.childNodes)
        //scoreText!.textContent = String(s.score);
        //multiplier!.textContent = String(s.multiplier);

    };

    
    

    function playnote(note: string[]){
        samples[note[1]].triggerAttackRelease(
        Tone.Frequency(Number(note[3]), "midi").toNote(), // Convert MIDI note to frequency
        Number(note[5]) - Number(note[4]), // Duration of the note in seconds, end - start
        undefined, // Use default time for note onset
        Number(note[2]), // Set velocity to quarter of the maximum velocity
        )
    }


    function playdistortednote(note: string[], s: State){
        samples[note[1]].triggerAttackRelease(
        Tone.Frequency(Number(note[3]), "midi").toNote(), // Convert MIDI note to frequency
        getRandomfloat(0.5, s), // Duration of the note in seconds, end - start
        undefined, // Use default time for note onset
        Number(note[2]), // Set velocity to quarter of the maximum velocity
    );
        //console.log(getRandomInt(4, s))
        //console.log(getRandomfloat(0.5, s))
    }

    function playtailnote(note: string[]){
        samples[note[1]].triggerAttackRelease(
        Tone.Frequency(Number(note[3]), "midi").toNote(), // Convert MIDI note to frequency
        0.020, // set to 20 milliseconds for each hold
        undefined, // Use default time for note onset
        Number(note[2]), // Set velocity to quarter of the maximum velocity
    );
    }


    function playrandomnote(s: State){
        const random_note = note_lst[getRandomInt(note_lst.length, s)]

        samples[random_note[1]].triggerAttackRelease(
        Tone.Frequency(Number(random_note[3]), "midi").toNote(), // Convert MIDI note to frequency
        Number(random_note[5]) - Number(random_note[4]), // Duration of the note in seconds, end - start
        undefined, // Use default time for note onset
        Number(random_note[2]), // Set velocity to quarter of the maximum velocity
        );
    }


    const moveline = (o:line) => (circle: Body) => <line>{
        ...o,
        createdTime: o.createdTime + Constants.TICK_RATE_MS,
        y1: (circle.createdTime + 2000 > Number(circle.note[5]) * 1000) && o.y1 <= 90 ? Math.min(Math.max(o.y1 + (4.375 * 90 / 350), 0), 90) : o.y1, // if 2 seconds after current time is after end of note, decrease y1
        y2: o.y2 <= 90 ? Math.min(Math.max(o.y2 + (4.375 * 90 / 350), 0), 90) : o.y2
    }

    //Function manipulate and returns a Body,Body is like a State inside a State, so requires an external function in tick to prevent side effects 
    const moveObj = (o:Body) => <Body>{
        ...o,
        y: Math.min(Math.max(o.y + 4.375, 0), 350), // set maximum limit to 350
        createdTime: o.createdTime + Constants.TICK_RATE_MS,
        line: o.line != undefined ? moveline(o.line)( o) : undefined
      }


    //set distorted property of circle to true and return new state
    const update_to_distorted = (s: State, o: Body) => {
        const bodylst = s.circles.filter(circle => circle.id != o.id)
        const new_body = {...o, distorted: true}

        return {...s, circles: [...bodylst, new_body] as ReadonlyArray<Body>, score: s.score >= 5 ? s.score - 5 : 0, combo: 0, multiplier: 1, tap: true}
    }


    //set tapped property of circle to true and return new state
    const succesfully_tapped = (s: State, o: Body) => {
        const bodylst = s.circles.filter(circle => circle.id != o.id)
        const new_body = {...o, tapped: true}


        return {...s, circles: [...bodylst, new_body] as ReadonlyArray<Body>,  score: s.score + (10 * s.multiplier), combo: s.combo + 1, multiplier: 0.2 * Math.floor((s.combo + 1)/ 10) + 1 , tap: true}
    }


    /**
     * Updates the state by proceeding with one time step. // This is the controller
     *
     * @param s Current state
     * @returns Updated state
     */
    const tick = (s: State, elapsed: number) => { 
        const currenttime = (elapsed * Constants.TICK_RATE_MS) 
        const notes_to_play = note_lst.filter( (item, index) => (currenttime / 1000 >=  Number(item[4]) && currenttime / 1000 <= Number(item[5])) && (index >= s.playnote_csv_index) )
        //console.log(s.playnote_csv_index)
        const notes_to_loadcanvas = note_lst.filter( (item, index) =>
             ((Number(item[4]) * 1000) - currenttime <= 2012 && (Number(item[4]) * 1000) - currenttime >= 1988 && item[0] == "True" )) // load notes that are at least 2 seconds before current time
            .reduce((acc, current, index) => {
                // reduce function removes duplicate notes
                
                if (index == 0){
                    return [current]
                }
                else{
                    if (Number(current[4]) != Number(acc[acc.length - 1][4]))
                        return [...acc, current]
                    else
                        return acc
                }
                
                //return index == 0 ? [current] : (Number(current[4]) != Number(acc[acc.length - 1][4])) ? [...acc, current] : acc
            } , [] as string[][])
            
        const newcircles = notes_to_loadcanvas.map((item, index) => createCircles(s)(index)(item)) // notes to generate in canvas in current tick
        const not = (f:(x:Body)=>boolean)=>(x:Body)=>!f(x);
        const expired = (b:Body) => b.line ? (b.y >= 350 && b.line.y1 == b.line.y2)  : b.y >= 350;
        const updatecircles = s.circles.map(moveObj); //update the movement of existing circles
        const expiredcircles = updatecircles.filter(expired);
        const activecircles = updatecircles.concat(newcircles).filter(not(expired));
        const end = (s.playnote_csv_index + notes_to_play.length) == note_lst.length - 1? true : false
        const missed_note_num = expiredcircles.filter(circle => !circle.tapped && !circle.line).length
        const new_seed = RNG.hash(s.current_seed);

        return <State>{...s, 
            circles: activecircles,
            exit: expiredcircles,
            totaltime: currenttime, 
            notes_to_play: notes_to_play, 
            notes_to_load: notes_to_loadcanvas,
            objCount: s.objCount + newcircles.length,
            playnote_csv_index: s.playnote_csv_index + notes_to_play.length,
            gameEnd: end,
            hold_duration: s.hold ? s.hold_duration + Constants.TICK_RATE_MS : 0,
            tap: false,
            play_random_note: false,
            missed_notes: s.missed_notes + missed_note_num,
            current_seed: new_seed
        }

    };

    const reduceState = (s:State, e: Tick | Tap | Hold | Pause | Restart)=>
    {
        if (e instanceof Tick){
            return tick(s, e.elapsed);
        }

        
        else if (e instanceof Hold){
            if (e.key == "KeyH"){
                const temp = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 20 && item.line != undefined) // length of temp is either 0 or 1 because duplicate notes with identical starting time is filtered in tick function
                
                //console.log(e.flag)
                if (temp.length != 0 && e.flag){ // flag == true to indicate holding down
                    return {...s, hold: true}
                } 
                else if (temp.length != 0 && e.flag == false){
                    //console.log(s.hold_duration)
                    if (Math.abs((Number(temp[0].note[5]) - Number(temp[0].note[4])) * 1000 - s.hold_duration) < 600) // if tail note succesfully played
                        return {...s, score: s.score + (30 * s.multiplier), combo: s.combo + 1, multiplier: 0.2 * Math.floor((s.combo + 1)/ 10) + 1, hold: false}

                    else
                        return {...s, score: Math.max(s.score - 5, 0) , combo: 0, multiplier: 1, hold: false}// else stop playing note decrease score

                    
                }
            }
            else if (e.key == "KeyJ"){
                const temp = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 40 && item.line != undefined) 
                
                //console.log(e.flag)
                if (temp.length != 0 && e.flag){ // flag == true to indicate holding down
                    return {...s, hold: true}
                } 
                else if (temp.length != 0 && e.flag == false){
                    //console.log(s.hold_duration)
                    if (Math.abs((Number(temp[0].note[5]) - Number(temp[0].note[4])) * 1000 - s.hold_duration) < 600) // if tail note succesfully played
                        return {...s, score: s.score + (30 * s.multiplier), combo: s.combo + 1, multiplier: 0.2 * Math.floor((s.combo + 1)/ 10) + 1, hold: false}

                    else
                        return {...s, score: Math.max(s.score - 5, 0), combo: 0, multiplier: 1, hold: false}// else stop playing note decrease score

                    
                }
            }
            else if (e.key == "KeyK"){
                const temp = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 60 && item.line != undefined) 
                
                //console.log(e.flag)
                if (temp.length != 0 && e.flag){ // flag == true to indicate holding down
                    return {...s, hold: true}
                } 
                else if (temp.length != 0 && e.flag == false){
                    //console.log(s.hold_duration)
                    if (Math.abs((Number(temp[0].note[5]) - Number(temp[0].note[4])) * 1000 - s.hold_duration) < 600) // if tail note succesfully played
                        return {...s, score: s.score + (30 * s.multiplier), combo: s.combo + 1, multiplier: 0.2 * Math.floor((s.combo + 1)/ 10) + 1, hold: false}

                    else
                        return {...s, score: Math.max(s.score - 5, 0), combo: 0, multiplier: 1, hold: false}// else stop playing note decrease score

                    
                }
            }
            else if (e.key == "KeyL"){
                const temp = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 80 && item.line != undefined) 
                
                //console.log(e.flag)
                if (temp.length != 0 && e.flag){ // flag == true to indicate holding down
                    return {...s, hold: true}
                } 
                else if (temp.length != 0 && e.flag == false){
                    //console.log(s.hold_duration)
                    if (Math.abs((Number(temp[0].note[5]) - Number(temp[0].note[4])) * 1000 - s.hold_duration) < 600) // if tail note succesfully played
                        return {...s, score: s.score + (30 * s.multiplier), combo: s.combo + 1, multiplier: 0.2 * Math.floor((s.combo + 1)/ 10) + 1, hold: false}

                    else
                        return {...s, score: Math.max(s.score - 5, 0), combo: 0, multiplier: 1, hold: false}// else stop playing note decrease score
                }
            }

            
            // if there are no circles nearby bottom at all
            if (s.score >= 5)
                return {...s, score: s.score - 5, combo: 0, multiplier: 1}
            else
                return {...s, score: 0, combo: 0, multiplier: 1}



        }
        
        else if (e instanceof Tap){
            const first_col = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 20) // length of is either 0 or 1 because duplicate notes is filtered in tick function, so no 2 notes that start and end at same time
            const second_col = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 40) // length of is either 0 or 1 because duplicate notes is filtered in tick function, so no 2 notes that start and end at same time
            const third_col = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 60) // length of is either 0 or 1 because duplicate notes is filtered in tick function, so no 2 notes that start and end at same time
            const fourth_col = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 80) // length of is either 0 or 1 because duplicate notes is filtered in tick function, so no 2 notes that start and end at same time

            //console.log("tap")
            if (e.key == "KeyH"){
                //const temp = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 20) 
                
                // if true increment score , false play random note
                if (first_col.length != 0){ 
                    if (!first_col[0].line) 
                        return succesfully_tapped(s, first_col[0]) 
                    else
                        return s
                } 
                else if (second_col.length != 0){
                    return update_to_distorted(s, second_col[0]);
                }
                else if (third_col.length != 0){
                    return update_to_distorted(s, third_col[0]);
                }
                else if (fourth_col.length != 0){
                    return update_to_distorted(s, fourth_col[0]);
                }
                
            }
            if (e.key == "KeyJ"){
                //const temp = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 40) 
                
                // if true increment score , false play random note
                if (second_col.length != 0){ 
                    if (!second_col[0].line) 
                        return succesfully_tapped(s, second_col[0])
                    else
                        return s
                }
                else if (first_col.length != 0){
                    return update_to_distorted(s, first_col[0]);
                }
                else if (third_col.length != 0){
                    return update_to_distorted(s, third_col[0]);
                }
                else if (fourth_col.length != 0){
                    return update_to_distorted(s, fourth_col[0]);
                }
                
            }
            if (e.key == "KeyK"){
                //const temp = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 60) 
                
                // if true increment score , false play random note
                if (third_col.length != 0){ 
                    if (!third_col[0].line) 
                        return succesfully_tapped(s, third_col[0])
                    else
                        return s
                }
                else if (first_col.length != 0){
                    return update_to_distorted(s, first_col[0]);
                }
                else if (second_col.length != 0){
                    return update_to_distorted(s, second_col[0]); 
                }
                else if (fourth_col.length != 0){
                    return update_to_distorted(s, fourth_col[0]);
                }
                
            }
            if (e.key == "KeyL"){
                //const temp = s.circles.filter(item => item.y >= 320 && item.y <= 350 && item.x == 80) 
                
                // if true increment score , false play random note
                if (fourth_col.length != 0){ 
                    if (!fourth_col[0].line) 
                        return succesfully_tapped(s, fourth_col[0])//return {...s, score: s.score + (10 * s.multiplier), combo: s.combo + 1, multiplier: 0.2 * Math.floor((s.combo + 1)/ 10) + 1, tap: true} 
                    else
                        return s
                }
                else if (first_col.length != 0){
                    return update_to_distorted(s, first_col[0]);
                }
                else if (second_col.length != 0){
                    return update_to_distorted(s, second_col[0]);  
                }
                else if (third_col.length != 0){
                    return update_to_distorted(s, third_col[0]);
                }
            }
            
            // set play_random_note to true and decrease score by 5
            
           
            if (s.score >= 5)
                return {...s, score: s.score - 5, combo: 0, multiplier: 1, play_random_note: true}
            else{
                //console.log(s.score)
                return {...s, score: 0, combo: 0, multiplier: 1, play_random_note: true}
            
            }
        }
        else if (e instanceof Pause){
            return s
        }
        else{
            // if instance of restart
            return {...s, circles: [] as ReadonlyArray<Body>, exit: s.circles, score: 0, multiplier: 0, tap: false, hold: false} // put all circles to exit to remove all circle on canvas

        }

    }



    merge(R$, of(true))
    .pipe(delay(1000))
    .subscribe(() => {

        startTimer();
    })

    function startTimer() {
        const source$ = tick$
            .pipe(
                map(elapsed=>new Tick(elapsed)),
                mergeWith(H$,J$,K$,L$, H_hold$, J_hold$, K_hold$, L_hold$),
                
                takeUntil(P$),
                takeUntil(R$),
                scan(reduceState, initialState),
            )
            .subscribe((s: State) => {
                s.notes_to_play.forEach(item =>{
                    if ((Number(item[5]) - Number(item[4])) < 1) // if not a tail note
                        playnote(item);           

                    

                })

                const tailnotes = s.circles.filter(circle => circle.line) // filter out circles that have tails 
                const distortednotes = s.circles.filter(circle => circle.distorted) // filter out circles that are "distorted", as in play a random duration between 0 to 0.5 seconds
                if (s.play_random_note){
                    playrandomnote(s);
                    //console.log("randomnoteplayed")
                }
                if (tailnotes.length != 0 && s.hold){
                    tailnotes.forEach(item => playtailnote(item.note))
                    //console.log("tailnoteplayed")
                }
                if (distortednotes.length != 0){
                    //console.log(distortednotes.length);
                    distortednotes.forEach(item => playdistortednote(item.note, s))
                    //console.log("distortednoteplayed")
                }


                render(s);

                if (s.gameEnd) {
                    show(gameover);
                    source$.unsubscribe();
                } else {
                    hide(gameover);
                }
            },
            () => console.log("error"),
            () => console.log("complete")
        );

    }




}

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    // Load in the instruments and then start your game!
    const samples = SampleLibrary.load({
        instruments: [
            "bass-electric",
            "violin",
            "piano",
            "trumpet",
            "saxophone",
            "trombone",
            "flute",
        ], // SampleLibrary.list,
        baseUrl: "samples/",
    });

    const startGame = (contents: string) => {
        document.body.addEventListener(
            "mousedown",
            function () {
                main(contents, samples);
            },
            { once: true },
        );
    };

    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;

    Tone.ToneAudioBuffer.loaded().then(() => {
        for (const instrument in samples) {
            samples[instrument].toDestination();
            samples[instrument].release = 0.5;
        }

        fetch(`${baseUrl}/assets/${Constants.SONG_NAME}.csv`)
            .then((response) => response.text())
            .then((text) => startGame(text))
            .catch((error) =>
                console.error("Error fetching the CSV file:", error),
            );
        
    });
}
