
// Static methods to import and export COMPLETE objects/classes to JSON.
// Also deals with RECURSION and OTHER issuses with JSON
//
// CJC is basically JSON with the bugs fixed.  The only extra element is that
//  CJC needs to know how to find class constructors.  Unfortunately this requires
//  specific registration using the CJC.RegisterConstructors() method.
//
// Some things are bad news being stored or are not required. For example jQuery
//  objects can be part of an active element, but this is stored for transient processing
//  only.  When reconstituted the context might have changed and screw-up the parse.
//  jQuery is ignored by default, but other classes are ignored with CJC.DoNotStringify()

// Note:  Constructors may well get no arguments so need to be 'safe' when called like that.
//  For example:
// | constructor(SomeString){
// |   if(SomeString.length == 456){...  // ERROR in FromJ() as SomeString will be undefined
// If you're initialising with elements like this then use
// | constructor(Foo,Bar,Buz){
// |   if(arguments.length>0){
// |     // initialise here


class CJC{

  // Copy a functional object deeply
  // ie.  every bit is a copy not a copy of a reference
  static DeepCopy(OriginalObj){
    CJC_DATA.deepCopying = true;
    var o = CJC.FromJ(CJC.ToJ(OriginalObj));
    CJC_DATA.deepCopying = false;
    return o;
  }


  //=======================================================================
  //       EXPORT TO   ---->
  //=======================================================================

  // Alias for CJC.ToJ()
  static toJSON(FromThing){
    return CJC.ToJ(FromThing);
  }

  // Export something, typically a 'classy' object to JSON
  // Returns a JSON string.
  // This is a drop-in replacement for JSON.stringify()
  // FromThing is whatever you want to convert to JSON.
  // Note: Deals with recursion, Dates, RegExp.
  //-------------------------------------------------------
  static ToJ(FromThing){
    var listRef = CJC._NewObjList();                 // Working list of what we've exported already
    var o = CJC._AddClassNames(listRef,FromThing);   // Add constructor names to objects as we export them
                                                     //  also replace duplicates with place-holders and hack
                                                     //  values that JSON has difficulty with
    CJC._RemoveObjList(listRef);                     // tidy up
    return JSON.stringify(o);                        // Now turn into a string
  }

  // This where the hard work of preparing for stringifying goes on.
  // It works down the object values, sub-objects and sub-sub-objects recursively
  // ListRef points to our private list of what we've already exported.  If we find we're
  //  repeating ourselves then we'll substitute a place-holder with a reference (in a
  //  property .CJC_PLACEHOLDER) which points to the listed object.
  //
  // Importantly, we embed the name of any object's constructor in the object itself (as ._class_name_) so
  //  we'll know how to reconstruct it when performing .FromJ().
  // We also deal with some of the issues that JSON doesn't handle.
  //  In particular Dates, RegExps, null and NaN.
  //--------------------------------------------------------------------------------------------------
  static _AddClassNames(ListRef,FromThing){

    // arrays need sub-elements processing
    if(Array.isArray(FromThing)){
      return FromThing.map(E=>CJC._AddClassNames(ListRef,E));
    }

    // Special cases where we have odd simple values.  The simplest hack (let's face it it's a hack,
    //  but we can't save as straight strings due to an ACTUAL bad case.) is to use loopy
    //  string stand-in tokens.
    var oddIx = [null,undefined].indexOf(FromThing);        // Strange! NaN not detected...
    if(oddIx > -1){return ['CJC_NULL','CJC_UNDEFINED'][oddIx];}
    if(Number.isNaN(FromThing)){return 'CJC_NAN';}          // ...So special test.



    // Objects might be built-in types which need specific handling. (ie Date and RegExp)
    // or with a known constructor.  Deal with built-ins first.
    if(typeof FromThing == 'object'){
      if(FromThing instanceof Date){
        return {_class_name_:"Date",value: FromThing.getTime() };   // date encoded in ms
      }
      if(FromThing instanceof RegExp){                              // regexp as a string
        return {_class_name_:"RegExp",value: FromThing.toString() };
      }

      // Some objects are far too complex, unnecessary and screw-up reconstruction
      // So drop these and replace with an information message.  A typical case is
      // where a DOM element is stored by an active component.  This is only of
      // transient use.
      // NOTE:  We block this removal if doing a deep copy (clone) where the objects
      //  will be remaining in core.
      if(CJC_DATA.deepCopying===false){
        var dsix=0;
        while(dsix<CJC_DATA.dontStore.length){
          if(FromThing instanceof CJC_DATA.dontStore[dsix][0]){
            return CJC_DATA.dontStore[dsix][1] + ' object removed by CJC';
          }
          dsix++;
        }
      }


      // . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
      // ... At this point we have some sort of custom object
      // ... we may have already exported it in which case we
      // ... have to  (a) not export it again
      // ... and also (b) put a place-holder replacement into
      // ... the object tree so we can fish it out later when importing.
      // ...
      // ... OR we haven't exported this object before so
      // ... make a note of it so we know not to export it again.
      // . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

      var prevRandId = CJC._InExportedList(ListRef,FromThing);  // exp previously?
      if(prevRandId !== false){                      // Just substitute a
        return {"CJC_PLACEHOLDER":prevRandId };      // simple place-holder
      }

      var randId = Math.floor(Math.random()*Number.MAX_SAFE_INTEGER);
      FromThing.CJC_IDENTITY=randId;              // have to do it here.  (messy)
      CJC._AddToExportedList(ListRef,FromThing);  // Make a note in the list of already exported

      // Now we have to process the sub-items in the same way
      var o = Object.assign({},FromThing);
      Object.entries(o).forEach(function(KV){
        o[KV[0]]=CJC._AddClassNames(ListRef,KV[1]);
      });
      // possibly add the class name unless this is a bare object
      var cn = FromThing.constructor.name;
      if(cn != 'Object'){o._class_name_ = cn;}
      return o;
    }

    // anything else as-is
    return FromThing;
  }


  // Helper for _AddClassNames()
  // Return false or object's CJC-IDENTITY depending on
  //  whether we've already got the object in the list.
  //---------------------------------------------------
  static _InExportedList(ListRef,AnObj){
    var ix = CJC_DATA.objLists[ListRef].indexOf(AnObj);
    if(ix<0){return false;}
    return CJC_DATA.objLists[ListRef][ix].CJC_IDENTITY;
  }

  // Helper for _AddClassNames()
  // Append object (with .CJC-IDENTITY property) to
  //  already exported list
  //--------------------------------------
  static _AddToExportedList(ListRef,AnObj){
    CJC_DATA.objLists[ListRef].push(AnObj);
  }


  //=======================================================================
  //       IMPORT FROM  <----
  //=======================================================================


  // Alias for CJC.FromJ()
  //----------------------
  static fromJSON(Jstring){
    return CJC.FromJ(Jstring);
  }

  // Convert a JSON string into a complete 'classy' object
  //  (if that's what it represents.)
  // Practically a drop-in replacement for JSON.parse()
  // Note:
  //   If Jstring isn't a string this returns "CJC.FromJ: EXPECTED STRING.  Given <type>"
  //   If the JSON.parse fails then thus returns "CJC.FromJ: PARSE FAILED. Info <info>"
  //   So as 99% of the time you're expecting an object to be returned, testing for a string
  //  or !Object.isObject()! or !instanceOf! will trap issues by being out-of-band
  //  and you can handle them there.
  // This shouldn't throw any exceptions.
  //------------------------------------------------------
  static FromJ(Jstring){

    // check we have a string
    var tj = typeof Jstring;
    if(tj != 'string'){return 'CJC.FromJ: EXPECTED STRING.  Given '+tj;}

    // low-level parse of JSON, watching for errors
    var obj;
    try{
      obj = JSON.parse(Jstring,CJC._Reconstructor);    // first go str->obj
    }catch(err){
      console.log(Jstring.replace(/,/g,',\n'));
      return CJC._JsonErrToString(err,Jstring);
    }
    // Now we've got an object but it may be riddled with placeholders
    // The grunt work happens in _ApplyDeferred()
    var listRef = CJC._NewObjList();                     // working list
    obj = CJC._ApplyDeferred(listRef,obj);               // replace place-holders
    CJC._RemoveObjList(listRef);                         // tidy up

    return obj;
  }


  // This is called by JSON.parse after each element is read.
  // It is a bottom-up process with sub-sub-elements being processed
  // before sub-elements etc.
  //
  // We do three things:
  // * Deal with the special tokens we need for null and NaN
  // * Deal with properly reconstituting Dates and RegExps
  // * Deal with creating a proper class from a raw object
  static _Reconstructor(Key,Val){

    // trap funny strings or return as-is
    if(typeof Val == 'string'){
      if(Val == 'CJC_NULL'){return null;}
      if(Val == 'CJC_NAN'){return Number.NaN;}
      return Val;
    }

    if(typeof Val == 'object'){
      if(Val.hasOwnProperty('_class_name_')){  // plain objects won't have this
        var cn = Val._class_name_;
        delete(Val._class_name_);  // tidy up to avoid artifacts

        if(cn=='Date'){return new Date(Val.value);}
        if(cn=='RegExp'){
          var va = Val.value.split('/');      // hack string into bits
          va.shift();                         //start is null
          var flags = va.pop();               //end is any flags
          return new RegExp(va.join('/'),flags);
        }

        // some known (hopefully) constructor
        var cl = window[cn];                      // built-in
        if(!cl){cl = CJC._GetConstructor(cn);}    // registered
        //console.log('gotclassname',cn);
        if(cl){
          var rv = new  cl();                     // create an instance
          Object.entries(Val).forEach(function(KV){  // copy values from 'data-obj' to 'class-obj'
            rv[KV[0]]=KV[1];
          });
          return rv;   // finished
        }
      }
    }

    return Val;   // anything else returned as-is
  }



  // At this point we've got an object (or sub-object) which might
  //  have one or more place-holders in it.  The procedure is to
  //  make a note of likely objects with their .CJC_IDENTITY properties
  //  so we can find them when we come across a place-holder and then
  //  substitute.
  // This recurses down the object tree in the same way as when we were
  //  exporting so we're fairly certain of reaching place-holders AFTER
  //  what they represent.
  //--------------------------------------------------------------------
  static _ApplyDeferred(ListRef,Obj){
    CJC._AddToDeferred(ListRef,Obj);

    Object.entries(Obj).forEach(function(KV){
      var k = KV[0];
      var v = KV[1];
      if(typeof v == 'object'){
        if(v === null){return;}
        if(Array.isArray(v)){
          v = v.map(E=>CJC._ApplyDeferred(ListRef,E));
          Obj[k] = v;
          return;
        }
        if(v.hasOwnProperty('CJC_PLACEHOLDER')){
          // we've got a placeholder
          var pid = v.CJC_PLACEHOLDER;
          var def = CJC._FetchDeferred(ListRef,pid);
          Obj[k] = def;
        }else{
          if(v.hasOwnProperty('CJC_IDENTITY')){
            CJC._AddToDeferred(ListRef,v);
            Obj[k] = CJC._ApplyDeferred(ListRef,v);
          }
        }
      }
    });
    return Obj;
  }

  // Helper for _ApplyDeferred()
  // Deferred objects are full objects with a CJC_IDENTITY property
  // Return the object to replace the place-holder, or if not found,
  //  its an error that should never happen, an error message string.
  //---------------------------------------------------------------
  static _FetchDeferred(ListRef,Id){
    var rv = CJC_DATA.objLists[ListRef].find(function(O){
      return O.CJC_IDENTITY==Id;
    });
    if(typeof rv == 'undefined'){
      rv = "CJC MISSING DEFERRED OBJECT ERROR";
    }
    return rv;
  }


  // Helper for _ApplyDeferred()
  //----------------------------
  static _AddToDeferred(ListRef,AnObj){
    CJC_DATA.objLists[ListRef].push(AnObj);
  }


  // Create a new list for objects and return a random id
  //  which will be used to reference it.
  //. We go to this trouble in case there are multiple
  //  threads which have to be kept separate.
  //------------------------------------------------------
  static _NewObjList(){
    var listRef = 'R'+Math.floor(Math.random()*99999999);
    CJC_DATA.objLists[listRef]=[];
    return listRef;
  }

  // Remove an object list.
  // Note:  This also removes the CJC_IDENTITY properties
  //  from the objects so as to tidy them up.
  //----------------------------------------------------
  static _RemoveObjList(ListRef){
    CJC_DATA.objLists[ListRef].forEach(function(O){
      delete O.CJC_IDENTITY;
    });
    delete CJC_DATA.objLists[ListRef];
  }

  /*
  // debugging.
  // Note: all these objects are supposed to have a .name property
  //  to help us while debugging
  static _DumpObjList(ListRef){
    return CJC_DATA.objLists[ListRef].map(D=>D.name+'('+D.CJC_IDENTITY+')').join('|');
  } */

  // Tell CJC about classes it needs to know how to reconstruct
  //  For example:
  // | CJC.RegisterConstructors([CmyClass,CmyOtherClass]);
  //-----------------------------------------------------------
  static RegisterConstructors(ArrayOfClasses){
    ArrayOfClasses.forEach(function(V){
      CJC_DATA.constructors[V.name] = V;
    });
  }

  // Is the constructor registered?
  static IsConstructorRegistered(ClassName){
    return Object.keys(CJC_DATA.constructors).includes(ClassName);
  }

  // Fetch a constructor by name
  //----------------------------
  static _GetConstructor(ClassName){
    return CJC_DATA.constructors[ClassName];
  }

  // Debugging aid to list all registered constructors
  // Returns a string.
  //--------------------------------------------------
  static DumpConstructorNames(){
    return Object.keys(CJC_DATA.constructors).sort().join('|');
  }

  // What's the version?  Returns a date string.
  //--------------------------------------------
  static get about(){
    return 'Version: {{BUILDDATE}}\n'+
           'Reference:vulpeculox.net/misc/jsjq/CJC/index.htm';
  }

  // JSON has thrown an exception which we've caught.
  //  Convert it into a string ready to be returned as
  //  an out-of-band respospone by FromJ
  //---------------------------------------------------
  static _JsonErrToString(Err,Jstring){
    // JSON parse error we assume

    console.log('JE2S',Err.toString());

    var a = Err.toString().split(':');
    //@@@@@@@ next line is fine for err at posn type err but not otherwise
    // needs fixing
    //a = a[2].split('of the');
    var parseProb = a[0].trim();   // eg unexpected character at line 1 column 1
    var m = /(\d+)\D+(\d+)/.exec(parseProb);
    var l=0;
    var c=0;
    if(m){
      l=Number.parseInt(m[1],10)-1;
      c=Number.parseInt(m[2],10)-20;
    }
    a = Jstring.split('\n');
    l = (l>a.length-1) ? 0 : l;
    var s = a[l];
    c = (c<0) ? 0 : c;
    c = (c>s.length-1) ? 0 : c;

    var badBit = s.substr(c,50);
    var msg = 'CJC.FromJ: PARSE FAILED. Info\n'+
              parseProb+'\n'+
              'Likely area starting at character '+(c+1)+' "'+badBit+'"';
    return msg;
  }



  // ========================================================
  // ==  Quite often we want to have a reference to a      ==
  // ==  container from a component. This has been known   ==
  // ==  to cause problems with CJC-ing because the        ==
  // ==  constructors get inter-meshed.                    ==
  // ==                                                    ==
  // ==  The solution is to remove the container to        ==
  // ==  cpmponent references before ToJ and after FromJ   ==
  // ==                                                    ==
  // ==  These routines will do automated remove and add   ==
  // ==  but it is up to the constructor to do the add     ==
  // ==  using ReplaceComponentUplinks() at the end of     ==
  // ==  the constr and RemoveComponentUplinks() before    ==
  // ==  the save.
  // ==                                                    ==
  // ==  In fact there is no CJC-ing involved.  All this   ==
  // ==  does is add/remove references with a label.       ==
  // ==  Remove doesn't check the reference actually       ==
  // ==  points to the parent.                             ==
  // ==                                                    ==
  // ==  Note: Child objects must be declared to have a    ==
  // ==  .Label property to be recognised.                 ==
  // ==                                                    ==
  // ==  Suppose Ccontainer has a property .thing which    ==
  // ==  is a Cthing class, and the Cthing class has a     ==
  // ==  property .owner which is a reference to           ==
  // ==  the parent.  To prepare for CJC-ing you would     ==
  // ==  call CJC.RemoveComponentUplinks(ctnr,'owner')     ==
  // ==  which would set the thing's ref to the parent to  ==
  // ==  null.  In the constructor of Ccontainer, after    ==
  // ==  everything else was constructed, you would call   ==
  // ==  CJC.ReplaceComponentUplinks(ctnr,'owner');        ==
  // ==                                                    ==
  // ========================================================
  // Example:
  // | constructor Cfoo(){
  // |   this.bar = new Cbar();      // has .myParent property
  // |   this.buz = new Cbuz();      // has .myParent property
  // |   this.fox = {arbitary:"object"};  // ignored by PutBackParent
  // |   CJC.ReplaceComponentUplinks(this,'myParent');
  // | }
  // ========================================================
  //------------------------------------------------------


  // Remove references to Parent which may exist in contained
  //  objects.  The Label string is how the contained objects refer
  //  to the parent.  To search arrays for elements which point
  //  to the parent container add the optional ArraysAlso
  //  argument as true.
  //
  // Example:
  // | class Cfoo{
  // |   get saveString(){
  // |     CJC.RemoveComponentUplinks(this,'myContainer',true);
  // |     return CJC.ToJ(this);
  // |   }
  // | }
  //------------------------------------------------------
  static RemoveComponentUplinks(Parent,Label,ArraysAlso){
    CJC._ReplaceUpLink(Parent,Label,null,ArraysAlso);
  }

  // This re-links components to the Parent container.
  // Typically call at end of cpntainer constructor.
  //
  // Example:
  // | class Cfoo{
  // |   constructor(){
  // |     stuff gets constructed
  // |     CJC.ReplaceComponentUplinks(this,'myContainer',true);
  // |   }
  // | }
  //------------------------------------------------------
  static ReplaceComponentUplinks(Parent,Label,ArraysAlso){
    CJC._ReplaceUpLink(Parent,Label,Parent,ArraysAlso);
  }



  // Seeks out immediate properties with a Label property and
  //  sets those properties to With.  With will be null or the
  //  Parent container.  If ArraysAlso is truthy then do the
  //  same for elements inside arrays also.
  //---------------------------------------------------------
  static _ReplaceUpLink(Parent,Label,With,ArraysAlso){
    // part 1 : Immediately linked components in their own right
    var  childLabels=Object.entries(Parent)
                        .filter(KV=>typeof KV[1]=='object')
                        .filter(KV=>Array.isArray(KV[1])===false)
                        .filter(KV=>(Label in KV[1]))
                        .map(KV=>KV[0]);
    childLabels.forEach(function(L){
      Parent[L][Label]=With;
    });

    // Part 2 : Possibly deal with items inside arrays.
    if(ArraysAlso){
      var possArrays = Object.entries(Parent)
                          .filter(KV=>Array.isArray(KV[1]))
                          .map(KV=>KV[1]);
      // trawl these arrays
      possArrays.forEach(function(Ay){   // span arrays in parent
        Ay.forEach(function(El){             // span elments in array
          if(typeof El=='object'){
            if(Array.isArray(El)===false){
              El[Label]=With;
            }
          }
        });
      });
    }
  }



  // Prevent certain classes being stringified.
  // Some objects are far too complex, unnecessary and screw-up reconstruction
  //  so drop these and replace with an information message.  A typical case is
  //  where a DOM element is stored by an active component.  This is only of
  //  transient use.
  // A good idea for instances of major libraries such as jQuery.
  static doNotStringify(Class,ClassName){
    CJC_DATA.dontStore.push([Class,ClassName]);
  }

  // Alias for .doNotStringify()
  static Block(Class,ClassName){
    CJC.doNotStringify(Class,ClassName);
  }

}


// *Global*
// This is used for (a) Registering constructors
//                  (b) stacks for avoiding recursion
var CJC_DATA = {
  constructors:{},    // name:constructor function
  objLists:{},        // will be {randid:[],anotherRandId:[],...}
  dontStore:[],       // array of classes and class names  eg jQuery
  deepCopying:false   // flag which blocks DoNotStringify()
};


// Handy do not save blocking for jQuery
if(jQuery){CJC.Block(jQuery,'jQuery');}

